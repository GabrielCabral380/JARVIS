"""
JARVIS Executor
===============
Execute planned steps with retry, rollback, and error recovery.
"""

import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent.task_queue import TaskQueue, Task, TaskStatus, Priority
from agent.error_handler import analyze_error, ErrorAction


class AgentExecutor:
    def __init__(self, max_retries: int = 3, timeout_per_step: int = 120):
        self.max_retries = max_retries
        self.timeout_per_step = timeout_per_step
        self._task_queue = None

    @property
    def task_queue(self) -> TaskQueue:
        if self._task_queue is None:
            from agent.task_queue import get_task_queue
            self._task_queue = get_task_queue()
        return self._task_queue

    def execute(self, plan: dict, speak_callback=None, cancel_event=None) -> dict:
        """
        Execute a plan (output from planner).
        
        Args:
            plan: Dict with "goals" and "steps"
            speak_callback: Function to speak progress updates
            cancel_event: threading.Event for cancellation
        
        Returns:
            {
                "goal": str,
                "success": bool,
                "results": [...],
                "errors": [...],
                "steps_completed": int,
                "steps_total": int
            }
        """
        goal = plan.get("goal", "unknown")
        steps = plan.get("steps", [])
        results = []
        errors = []
        steps_completed = 0

        if speak_callback:
            speak_callback(f"Starting task: {goal}")

        for i, step in enumerate(steps):
            # Check cancellation
            if cancel_event and cancel_event.is_set():
                errors.append({"step": step.get("id"), "error": "cancelled"})
                break

            step_id = step.get("id", f"step_{i+1}")
            step_desc = step.get("description", step_id)

            if speak_callback:
                speak_callback(f"Step {i+1}: {step_desc}")

            # Execute with retry
            result = self._execute_step_with_retry(step, results, errors)
            if result["success"]:
                steps_completed += 1
                results.append({
                    "step": step_id,
                    "status": "completed",
                    "output": result.get("output", "")
                })
                # Store result for later steps
                results[-1]["data"] = result.get("data")
            else:
                # Analyze error and decide action
                error_info = analyze_error(result.get("error", ""), step)
                action = error_info["action"]

                if action == ErrorAction.RETRY:
                    # Retry already exhausted in _execute_step_with_retry
                    errors.append({"step": step_id, "error": result.get("error", "")})
                elif action == ErrorAction.SKIP:
                    errors.append({"step": step_id, "error": "skipped: " + result.get("error", "")})
                    continue
                elif action == ErrorAction.REPLAN:
                    # Try to replan from current state
                    from agent.planner import replan
                    new_plan = replan(plan, {
                        "step_id": step_id,
                        "error": result.get("error", ""),
                        "results_so_far": results
                    })
                    if new_plan and new_plan.get("steps"):
                        remaining_steps = new_plan["steps"][-min(3, len(new_plan["steps"])):]
                        # Append replanned steps (simplified)
                        for rs in remaining_steps:
                            rs["id"] = f"replan_{steps_completed + 1}"
                        return self.execute(
                            {"goal": goal, "steps": remaining_steps},
                            speak_callback, cancel_event
                        )
                    errors.append({"step": step_id, "error": "replan failed"})
                else:  # ABORT
                    errors.append({"step": step_id, "error": "aborted: " + result.get("error", "")})
                    break

        success = steps_completed == len(steps)
        return {
            "goal": goal,
            "success": success,
            "results": results,
            "errors": errors,
            "steps_completed": steps_completed,
            "steps_total": len(steps)
        }

    def _execute_step_with_retry(self, step: dict, previous_results: list, previous_errors: list) -> dict:
        """Execute a single step with retry logic."""
        step_id = step.get("id", "unknown")
        tool = step.get("tool", "")
        action = step.get("action", "")
        args = step.get("args", {})

        last_error = ""
        for attempt in range(self.max_retries):
            try:
                output = self._call_tool(tool, action, args, previous_results)
                return {"success": True, "output": output}
            except Exception as e:
                last_error = str(e)
                if attempt < self.max_retries - 1:
                    time.sleep(1 * (attempt + 1))  # Exponential-ish backoff

        return {"success": False, "error": f"Failed after {self.max_retries} attempts: {last_error}"}

    def _call_tool(self, tool: str, action: str, args: dict, previous_results: list) -> str:
        """
        Call a Mark-XLVI action tool.
        
        This dispatches to the Python action modules via subprocess.
        """
        integrations_dir = Path(__file__).resolve().parent.parent
        call_script = integrations_dir / "call.py"

        if not call_script.exists():
            raise RuntimeError(f"Tool runner not found: {call_script}")

        # Inject previous results into args if <RESULT> placeholder exists
        for key, value in args.items():
            if isinstance(value, str) and "<RESULT>" in value:
                result_idx = int(value.split("_")[-1]) if "_" in value else 0
                if result_idx < len(previous_results):
                    prev_data = previous_results[result_idx].get("output", "")
                    args[key] = value.replace(f"<RESULT>_{result_idx}", prev_data)

        payload = json.dumps({
            "function": tool,
            "args": args
        }, ensure_ascii=False)

        result = subprocess.run(
            [sys.executable, str(call_script), payload],
            capture_output=True,
            text=True,
            timeout=self.timeout_per_step,
            cwd=str(integrations_dir),
        )

        if result.returncode != 0:
            raise RuntimeError(f"Tool {tool} failed: {result.stderr or result.stdout}")

        try:
            output = json.loads(result.stdout)
            return output.get("output", result.stdout)
        except json.JSONDecodeError:
            return result.stdout


class SimpleExecutor:
    """Simplified executor for single-task execution."""
    
    @staticmethod
    def run_once(tool: str, args: dict) -> str:
        """Run a single tool and return result."""
        agent = AgentExecutor(max_retries=2)
        result = agent._execute_step_with_retry(
            {"id": "single", "tool": tool, "args": args},
            [], []
        )
        return result.get("output", "") if result.get("success") else result.get("error", "")
