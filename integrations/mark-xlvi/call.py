#!/usr/bin/env python3
"""
Mark-XLVI Action Entry Points
==============================
Thin wrappers that bridge CLI/Node.js calls to the original Mark-XLVI
action modules. Uses unified API key resolution from JARVIS config.

Priority: JARVIS .env > integrations/mark-xlvi/config/api_keys.json > env vars
"""

import json
import sys
from pathlib import Path

# Ensure actions/ and config/ are importable regardless of CWD
_INTEGRATION_DIR = Path(__file__).resolve().parent.parent
_ACTIONS_DIR = _INTEGRATION_DIR / "actions"
_CONFIG_DIR = _ACTIONS_DIR / "config"
for _p in [_ACTIONS_DIR, _CONFIG_DIR, str(_INTEGRATION_DIR)]:
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

INTEGRATION_DIR = _INTEGRATION_DIR
CONFIG_FILE = _INTEGRATION_DIR / "config" / "api_keys.json"


def _load_config() -> dict:
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _get_api_key() -> str:
    """Use unified config from actions/config/__init__.py"""
    from config import get_api_key
    return get_api_key()


def flight_finder(origin: str = "", destination: str = "", date: str = "", **kwargs) -> str:
    """Search flights between cities."""
    from actions.flight_finder import flight_finder as _fn
    return _fn(parameters={"origin": origin, "destination": destination, "date": date or None})


def game_updater(parameters: dict = None, **kwargs) -> str:
    """Update Steam games."""
    from actions.game_updater import game_updater as _gu
    return _gu(parameters=parameters or kwargs)


def youtube_video(parameters: dict = None, **kwargs) -> str:
    """Transcript/download/search YouTube."""
    from actions.youtube_video import youtube_video as _yt
    return _yt(parameters=parameters or kwargs)


def code_helper(parameters: dict = None, **kwargs) -> str:
    """Write, review, or fix code using Gemini."""
    from actions.code_helper import code_helper as _ch
    return _ch(parameters=parameters or kwargs)


def dev_agent(parameters: dict = None, **kwargs) -> str:
    """Multi-step development agent."""
    from actions.dev_agent import dev_agent as _da
    return _da(parameters=parameters or kwargs)


def reminder(parameters: dict = None, **kwargs) -> str:
    """Set/list/clear reminders."""
    from actions.reminder import reminder as _r
    return _r(parameters=parameters or kwargs)


def weather_report(city: str = "", when: str = "today", **kwargs) -> str:
    """Get weather for a city."""
    from actions.weather_report import weather_action
    return weather_action(parameters={"city": city, "time": when})


def file_processor(parameters: dict = None, **kwargs) -> str:
    """Process files: summarize, extract_text, convert, ocr, etc."""
    from actions.file_processor import file_processor as _fp
    return _fp(parameters=parameters or kwargs)


def browser_control(parameters: dict = None, **kwargs) -> str:
    """Browser automation via Playwright."""
    from actions.browser_control import browser_control as _bc
    return _bc(parameters=parameters or kwargs)


def screen_processor(parameters: dict = None, **kwargs) -> str:
    """Analyze screen content with vision."""
    from actions.screen_processor import screen_process
    return screen_process(parameters=parameters or kwargs)


def computer_settings(parameters: dict = None, **kwargs) -> str:
    """OS-level settings: volume, brightness, wifi, power."""
    from actions.computer_settings import computer_settings as _cs
    return _cs(parameters=parameters or kwargs)


def desktop_control(parameters: dict = None, **kwargs) -> str:
    """Desktop automation: run scripts, sandbox, etc."""
    from actions.desktop import desktop_control as _dc
    return _dc(parameters=parameters or kwargs)


def open_app(app_name: str = "", **kwargs) -> str:
    """Open any application by name."""
    from actions.open_app import open_app as _oa
    return _oa(parameters={"app_name": app_name})


def send_message(parameters: dict = None, **kwargs) -> str:
    """Send message via external platforms."""
    from actions.send_message import send_message as _sm
    return _sm(parameters=parameters or kwargs)


def web_search(query: str = "", mode: str = "search", **kwargs) -> str:
    """Search the web using Gemini + DuckDuckGo fallback."""
    from actions.web_search import web_search as _ws
    return _ws(parameters={"query": query, "mode": mode})


def execute_plan(plan: dict = None, **kwargs) -> str:
    """Execute a plan from the planner. Returns JSON with results."""
    from agent.executor import AgentExecutor
    executor = AgentExecutor(max_retries=2)
    result = executor.execute(plan or kwargs.get("plan", {}))
    return json.dumps(result, ensure_ascii=False)


def list_tasks(status: str = None, **kwargs) -> str:
    """List tasks from the global task queue."""
    from agent.task_queue import get_task_queue
    q = get_task_queue()
    tasks = q.list_tasks(status_filter=status)
    return json.dumps({"success": True, "tasks": tasks}, ensure_ascii=False)


def error_handler(error_message: str = "", **kwargs) -> str:
    """Analyze an error and suggest action."""
    from agent.error_handler import analyze_error
    r = analyze_error(error_message)
    return json.dumps(r, ensure_ascii=False)


def create_plan(goal: str = "", **kwargs) -> str:
    """Create a multi-step plan for a goal."""
    from agent.planner import create_plan as _plan
    r = _plan(goal)
    return json.dumps(r, ensure_ascii=False)


def task_status(**kwargs) -> str:
    """Get status of the task queue."""
    from agent.task_queue import get_task_queue
    q = get_task_queue()
    return json.dumps({
        "success": True,
        "pending": q.pending_count(),
        "running": q.running_count(),
        "tasks": q.list_tasks()
    }, ensure_ascii=False)


def cancel_task(task_id: str = "", **kwargs) -> str:
    """Cancel a task by ID."""
    from agent.task_queue import get_task_queue
    q = get_task_queue()
    cancelled = q.cancel(task_id)
    return json.dumps({"success": True, "cancelled": cancelled}, ensure_ascii=False)


# CLI interface
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python call.py <function> '<json_args>'")
        print("       python call.py --agent '<json_payload>'")
        print("\nAvailable functions:")
        funcs = [k for k, v in sorted(globals().items()) if callable(v) and not k.startswith("_")]
        for f in funcs:
            print(f"  {f}")
        sys.exit(1)

    # Direct agent mode: pass full JSON payload
    if sys.argv[1] == "--agent":
        try:
            payload = json.loads(sys.argv[2]) if len(sys.argv) >= 3 else {}
        except json.JSONDecodeError:
            print(json.dumps({"success": False, "error": "Invalid JSON payload"}))
            sys.exit(1)
        action = payload.get("action", "")
        parameters = payload.get("parameters", {})
        func = globals().get(action)
        if not func:
            print(json.dumps({"success": False, "error": f"Unknown action: {action}"}))
            sys.exit(1)
        try:
            result = func(**parameters if isinstance(parameters, dict) else {"parameters": parameters})
            print(json.dumps({"success": True, "output": str(result)}, ensure_ascii=False))
        except Exception as e:
            print(json.dumps({"success": False, "error": str(e)}))
            sys.exit(1)
        sys.exit(0)

    func_name = sys.argv[1]
    args = {}
    if len(sys.argv) >= 3:
        try:
            args = json.loads(sys.argv[2])
        except json.JSONDecodeError:
            print(json.dumps({"success": False, "error": "Invalid JSON"}))
            sys.exit(1)

    func = globals().get(func_name)
    if not func:
        print(json.dumps({"success": False, "error": f"Unknown function: {func_name}"}))
        sys.exit(1)

    try:
        result = func(**args)
        print(json.dumps({"success": True, "output": str(result)}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)
