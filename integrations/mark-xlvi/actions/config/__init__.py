# Standalone config shim for Mark-XLVI integrations
# Original imports: from config import is_windows, is_mac, is_linux, get_os
# This shim reads from config/api_keys.json in the parent integration dir

import json
import platform
from pathlib import Path

_CONFIG_FILE = Path(__file__).resolve().parent.parent / "config" / "api_keys.json"

def _load_config() -> dict:
    try:
        with open(_CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def _platform_os() -> str:
    return {"Windows": "windows", "Darwin": "mac", "Linux": "linux"}.get(
        platform.system(), "linux"
    )

def get_os() -> str:
    return _load_config().get("os_system", _platform_os()).lower()

def is_windows() -> bool: return get_os() == "windows"
def is_mac() -> bool:     return get_os() == "mac"
def is_linux() -> bool:   return get_os() == "linux"
