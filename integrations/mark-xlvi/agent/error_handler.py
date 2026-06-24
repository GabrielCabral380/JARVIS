"""
JARVIS Error Handler
====================
LLM-powered error classification and recovery decisions.
"""

import json
import re
import sys
from pathlib import Path
from enum import Enum


class ErrorAction(Enum):
    RETRY = "retry"
    SKIP = "skip"
    REPLAN = "replan"
    ABORT = "abort"


# Common error patterns (no LLM needed)
_PATTERNS = {
    r"(?i)(timeout|timed out|deadline exceeded)": {
        "action": ErrorAction.RETRY,
        "reason": "Transient timeout - retry usually succeeds"
    },
    r"(?i)(rate.?limit|429|too many requests|throttl)": {
        "action": ErrorAction.RETRY,
        "reason": "Rate limited - retry with backoff"
    },
    r"(?i)(connection refused|connection reset|ECONNREFUSED|network.*error)": {
        "action": ErrorAction.RETRY,
        "reason": "Network error - likely transient"
    },
    r"(?i)(file not found|no such file|FileNotFoundError)": {
        "action": ErrorAction.SKIP,
        "reason": "Missing file - skipping won't harm the goal"
    },
    r"(?i)(permission denied|access denied|PermissionError|403|forbidden)": {
        "action": ErrorAction.ABORT,
        "reason": "Permission issue - won't resolve with retry"
    },
    r"(?i)(syntax error|SyntaxError|invalid syntax)": {
        "action": ErrorAction.REPLAN,
        "reason": "Code error - needs replanning with correct syntax"
    },
    r"(?i)(ImportError|ModuleNotFoundError|No module named)": {
        "action": ErrorAction.REPLAN,
        "reason": "Missing dependency - needs installation step"
    },
    r"(?i)(OOM|out of memory|MemoryError|cannot allocate)": {
        "action": ErrorAction.REPLAN,
        "reason": "Resource limit - needs alternative approach"
    },
    r"(?i)(segmentation fault|segfault|core dumped)": {
        "action": ErrorAction.ABORT,
        "reason": "Critical system error"
    },
    r"(?i)(disk full|no space left|ENOSPC)": {
        "action": ErrorAction.ABORT,
        "reason": "Storage limit reached"
    },
}


def analyze_error(error_message: str, step_context: dict = None) -> dict:
    """
    Analyze an error and decide the best recovery action.
    
    Returns:
        {
            "action": "retry|skip|replan|abort",
            "reason": "explanation",
            "confidence": 0.0-1.0
        }
    """
    if not error_message:
        return {
            "action": ErrorAction.RETRY.value,
            "reason": "Unknown error - will retry",
            "confidence": 0.3
        }

    # Pattern matching (fast, no LLM)
    for pattern, info in _PATTERNS.items():
        if re.search(pattern, error_message):
            return {
                "action": info["action"].value,
                "reason": info["reason"],
                "confidence": 0.7
            }

    # Default: retry with low confidence
    return {
        "action": ErrorAction.RETRY.value,
        "reason": f"Unrecognized error type: {error_message[:200]}",
        "confidence": 0.3
    }


def analyze_error_with_llm(error_message: str, step_context: dict = None) -> dict:
    """
    Advanced error analysis using LLM (requires API key).
    Falls back to pattern matching if no API available.
    """
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "actions"))
    from config import get_api_key, get_provider

    api_key = get_api_key()
    if not api_key:
        return analyze_error(error_message, step_context)

    step_str = json.dumps(step_context or {}, ensure_ascii=False)[:300]

    prompt = f"""Analyze this execution error and decide the recovery action.

Step: {step_str}
Error: {error_message[:500]}

Choose one action:
- retry: Temporary issue, will succeed on retry
- skip: Non-critical step, can continue without it
- replan: Approach is wrong, need different plan
- abort: Critical failure, cannot continue

Output JSON: {{"action": "retry|skip|replan|abort", "reason": "<explanation>"}}
Output ONLY JSON."""

    try:
        provider = get_provider()
        if provider == "gemini":
            result = _call_gemini(prompt, api_key)
        else:
            result = _call_openai(prompt, api_key, get_provider())

        if result.get("action") in ("retry", "skip", "replan", "abort"):
            return {
                "action": result["action"],
                "reason": result.get("reason", ""),
                "confidence": 0.9
            }
    except Exception:
        pass

    # Fallback to pattern matching
    return analyze_error(error_message, step_context)


def _call_gemini(prompt: str, api_key: str) -> dict:
    import urllib.request
    import os

    model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = json.dumps({
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 200}
    }).encode("utf-8")

    req = urllib.request.Request(url, data=payload, headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "{}")
    return json.loads(text)


def _call_openai(prompt: str, api_key: str, provider: str) -> dict:
    import urllib.request
    import os

    base_url = "https://openrouter.ai/api/v1" if provider == "openrouter" else "https://api.openai.com/v1"
    model = os.environ.get("OPENAI_MODEL" if provider == "openai" else "OPENROUTER_MODEL", "gpt-4o-mini")
    url = f"{base_url}/chat/completions"
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": "Output valid JSON only."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3,
        "max_tokens": 200
    }).encode("utf-8")

    req = urllib.request.Request(url, data=payload, headers={
        "content-type": "application/json",
        "authorization": f"Bearer {api_key}"
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    text = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
    return json.loads(text)


def format_error_report(errors: list) -> str:
    """Format execution errors for user-friendly display."""
    if not errors:
        return "No errors occurred."

    lines = [f"Execution completed with {len(errors)} error(s):"]
    for i, err in enumerate(errors, 1):
        step = err.get("step_id", "?")
        action = err.get("recovery_action", {}).get("action", "?")
        reason = err.get("recovery_action", {}).get("reason", err.get("error", ""))
        lines.append(f"  {i}. Step {step}: [{action}] {reason}")

    return "\n".join(lines)
