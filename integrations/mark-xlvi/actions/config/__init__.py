# Unified config for Mark-XLVI integrations
# Reads from JARVIS root .env or integrations/mark-xlvi/config/api_keys.json
# Priority: JARVIS .env > api_keys.json > env vars

import json
import os
import platform
from pathlib import Path

# Try JARVIS root .env first (3 levels up from actions/config/)
JARVIS_ROOT = Path(__file__).resolve().parent.parent.parent.parent
JARVIS_ENV = JARVIS_ROOT / ".env"
LOCAL_CONFIG = Path(__file__).resolve().parent.parent / "config" / "api_keys.json"

def _read_jarvis_env() -> dict:
    """Read JARVIS .env file."""
    out = {}
    if not JARVIS_ENV.exists():
        return out
    for _line in JARVIS_ENV.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _k, _v = _line.split("=", 1)
        out[_k.strip()] = _v.strip().strip('"').strip("'")
    return out

def _read_local_config() -> dict:
    """Read local api_keys.json."""
    try:
        with open(LOCAL_CONFIG, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

# Merge: .env wins over api_keys.json
_env = {**_read_local_config(), **_read_jarvis_env(), **os.environ}

def _platform_os() -> str:
    return {"Windows": "windows", "Darwin": "mac", "Linux": "linux"}.get(
        platform.system(), "linux"
    )

def get_provider() -> str:
    """Get active AI provider (gemini, openai, openrouter, local)."""
    return _env.get("AI_PROVIDER", "local").lower().strip()

def get_api_key(provider: str = None) -> str:
    """Get API key for the specified or active provider."""
    p = provider or get_provider()
    key_map = {
        "gemini": "GEMINI_API_KEY",
        "openai": "OPENAI_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
    }
    return _env.get(key_map.get(p, ""), "")

def get_model() -> str:
    """Get model for active provider."""
    p = get_provider()
    model_map = {
        "gemini": "GEMINI_MODEL",
        "openai": "OPENAI_MODEL",
        "openrouter": "OPENROUTER_MODEL",
    }
    defaults = {
        "gemini": "gemini-2.0-flash",
        "openai": "gpt-4o-mini",
        "openrouter": "openai/gpt-4o-mini",
    }
    return _env.get(model_map.get(p, ""), defaults.get(p, ""))

def get_os() -> str:
    """Get OS from config or auto-detect."""
    return _env.get("os_system", _platform_os()).lower()

def is_windows() -> bool: return get_os() == "windows"
def is_mac() -> bool:     return get_os() == "mac"
def is_linux() -> bool:   return get_os() == "linux"

def get_gemini_key() -> str:
    return _env.get("GEMINI_API_KEY", "")

def get_openai_key() -> str:
    return _env.get("OPENAI_API_KEY", "")

def get_openrouter_key() -> str:
    return _env.get("OPENROUTER_API_KEY", "")
