"""
Mark-XLVI Integration Router for JARVIS Hub
============================================
Unified API key resolution:
- Uses JARVIS .env config (GEMINI_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY)
- Falls back to integrations/mark-xlvi/config/api_keys.json
- Auto-detects provider from AI_PROVIDER env var

Usage from server.js:
  import { execMarkXLVI } from './integrations/mark-xlvi/router.js';
  const result = await execMarkXLVI('weather_report', { city: 'São Paulo' });
"""

import json
import subprocess
import sys
import os
from pathlib import Path

INTEGRATIONS_DIR = Path(__file__).resolve().parent
ACTIONS_DIR = INTEGRATIONS_DIR / "actions"
JARVIS_ROOT = INTEGRATIONS_DIR.parent.parent

# Map action name → script entry point
ACTION_SCRIPTS = {
    "flight_finder": "flight_finder.py",
    "game_updater": "game_updater.py",
    "youtube_video": "youtube_video.py",
    "code_helper": "code_helper.py",
    "dev_agent": "dev_agent.py",
    "reminder": "reminder.py",
    "weather_report": "weather_report.py",
    "file_processor": "file_processor.py",
    "browser_control": "browser_control.py",
    "screen_processor": "screen_processor.py",
    "computer_control": "computer_control.py",
    "computer_settings": "computer_settings.py",
    "desktop": "desktop.py",
    "open_app": "open_app.py",
    "send_message": "send_message.py",
    "web_search": "web_search.py",
}


def _read_jarvis_env() -> dict:
    """Read JARVIS root .env for API keys."""
    env_path = JARVIS_ROOT / ".env"
    out = {}
    if not env_path.exists():
        return out
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def get_active_provider() -> str:
    """Detect active AI provider from environment."""
    env = _read_jarvis_env()
    provider = env.get("AI_PROVIDER", "").lower().strip()
    if provider:
        return provider
    # Auto-detect from keys
    if env.get("GEMINI_API_KEY"):
        return "gemini"
    if env.get("OPENROUTER_API_KEY"):
        return "openrouter"
    if env.get("OPENAI_API_KEY"):
        return "openai"
    return "local"


def get_api_key() -> str:
    """Get API key for the active provider."""
    env = _read_jarvis_env()
    provider = get_active_provider()
    key_map = {
        "gemini": "GEMINI_API_KEY",
        "openai": "OPENAI_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
    }
    return env.get(key_map.get(provider, ""), "")


def run_action(action_name: str, params: dict, timeout: int = 120) -> dict:
    """
    Execute a Mark-XLVI action module.
    
    Args:
        action_name: Key from ACTION_SCRIPTS
        params: Dict of parameters to pass as JSON
        timeout: Max seconds to wait
        
    Returns:
        { success: bool, output: str, error: str | None }
    """
    script = ACTION_SCRIPTS.get(action_name)
    if not script:
        return {"success": False, "output": "", "error": f"Unknown action: {action_name}"}

    script_path = ACTIONS_DIR / script
    if not script_path.exists():
        return {"success": False, "output": "", "error": f"Script not found: {script_path}"}

    env = os.environ.copy()
    # Pass JARVIS env vars to Python subprocess
    jarvis_env = _read_jarvis_env()
    for key in ["GEMINI_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "AI_PROVIDER"]:
        if jarvis_env.get(key):
            env[key] = jarvis_env[key]
    env["PYTHONPATH"] = str(INTEGRATIONS_DIR)

    payload = json.dumps({"action": action_name, "parameters": params})

    try:
        result = subprocess.run(
            [sys.executable, str(script_path), payload],
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
            cwd=str(INTEGRATIONS_DIR),
        )

        if result.returncode == 0:
            return {
                "success": True,
                "output": result.stdout.strip(),
                "error": None,
            }
        else:
            return {
                "success": False,
                "output": result.stdout.strip(),
                "error": result.stderr.strip() or f"Exit code: {result.returncode}",
            }
    except subprocess.TimeoutExpired:
        return {"success": False, "output": "", "error": f"Timeout after {timeout}s"}
    except Exception as e:
        return {"success": False, "output": "", "error": str(e)}


def list_actions() -> list[dict]:
    """Return available actions with description."""
    actions = []
    for name, script in ACTION_SCRIPTS.items():
        script_path = ACTIONS_DIR / script
        if script_path.exists():
            desc = ""
            try:
                content = script_path.read_text(encoding="utf-8", errors="ignore")
                for line in content.splitlines():
                    stripped = line.strip()
                    if stripped.startswith('"""') or stripped.startswith("'''"):
                        if stripped.count('"""') >= 2 or stripped.count("'''") >= 2:
                            desc = stripped.strip('"""').strip("'''").strip()
                            break
                        continue
                    elif stripped and stripped != "import" and not stripped.startswith("#"):
                        break
            except Exception:
                pass
            actions.append({"name": name, "script": script, "description": desc})
    return actions


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python router.py <action_name> '<json_params>'")
        print(f"\nActive provider: {get_active_provider()}")
        print(f"API key set: {'yes' if get_api_key() else 'no'}")
        print("\nAvailable actions:")
        for a in list_actions():
            print(f"  {a['name']:20s} → {a['script']}")
        sys.exit(1)

    action = sys.argv[1]
    params = {}
    if len(sys.argv) >= 3:
        try:
            params = json.loads(sys.argv[2])
        except json.JSONDecodeError:
            print(json.dumps({"success": False, "error": "Invalid JSON params"}))
            sys.exit(1)

    result = run_action(action, params)
    print(json.dumps(result, ensure_ascii=False, indent=2))
