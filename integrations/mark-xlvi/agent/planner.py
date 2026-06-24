"""
JARVIS Planner
==============
LLM-based goal decomposition into executable tool-calling steps.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "actions"))
from config import get_api_key, get_model, get_provider


def _call_llm(prompt: str, max_tokens: int = 2000) -> str:
    """Call LLM using the configured provider."""
    provider = get_provider()
    api_key = get_api_key()
    model = get_model()

    if not api_key:
        return ""

    try:
        if provider == "gemini":
            return _call_gemini(prompt, api_key, model, max_tokens)
        else:
            return _call_openai_compat(prompt, api_key, model, max_tokens)
    except Exception:
        return ""


def _call_gemini(prompt: str, api_key: str, model: str, max_tokens: int) -> str:
    """Call Gemini API."""
    import urllib.request

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = json.dumps({
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": max_tokens}
    }).encode("utf-8")

    req = urllib.request.Request(url, data=payload, headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")


def _call_openai_compat(prompt: str, api_key: str, model: str, max_tokens: int) -> str:
    """Call OpenAI-compatible API (OpenRouter, OpenAI, local)."""
    import urllib.request

    # Determine base URL from provider
    from config import get_provider
    prov = get_provider()
    base_url = "https://openrouter.ai/api/v1"
    if prov == "openai":
        base_url = "https://api.openai.com/v1"

    url = f"{base_url}/chat/completions"
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": "You are JARVIS, a precise AI assistant. Output valid JSON only."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.7,
        "max_tokens": max_tokens
    }).encode("utf-8")

    headers = {
        "content-type": "application/json",
        "authorization": f"Bearer {api_key}"
    }

    req = urllib.request.Request(url, data=payload, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data.get("choices", [{}])[0].get("message", {}).get("content", "")


def create_plan(goal: str, available_tools: list = None, context: dict = None) -> dict:
    """
    Decompose a user goal into executable steps using LLM.
    
    Args:
        goal: User's natural language goal
        available_tools: List of available tool names
        context: Additional context (memory, files, etc.)
    
    Returns:
        {
            "goal": str,
            "steps": [
                {
                    "id": "step_1",
                    "tool": "tool_name",
                    "action": "action_name",
                    "args": {...},
                    "description": "Human readable description",
                    "depends_on": []
                }
            ],
            "estimated_time": str,
            "risk_level": "low|medium|high"
        }
    """
    tools_list = available_tools or list_tools()
    context_str = ""
    if context:
        context_str = f"\\nContext: {json.dumps(context, ensure_ascii=False)[:500]}"

    prompt = f"""Decompose this goal into executable steps using only the available tools.
Goal: {goal}
Available tools: {', '.join(tools_list)}{context_str}

Output JSON:
{{
  "goal": "<original goal>",
  "steps": [
    {{
      "id": "step_1",
      "tool": "<tool_name>",
      "action": "<action>",
      "args": {{}},
      "description": "<what this step does>",
      "depends_on": []
    }}
  ],
  "estimated_time": "<time estimate>",
  "risk_level": "low|medium|high"
}}

Rules:
- Maximum 5 steps
- Each step uses exactly one tool
- Dependencies must reference earlier step IDs
- Be specific with args (file paths, URLs, etc.)
- Output ONLY valid JSON, no explanation."""

    response = _call_llm(prompt)
    if not response:
        return _fallback_plan(goal, tools_list)

    try:
        # Extract JSON from response
        json_start = response.find("{")
        json_end = response.rfind("}") + 1
        if json_start >= 0 and json_end > json_start:
            plan = json.loads(response[json_start:json_end])
            if "steps" in plan and len(plan["steps"]) > 0:
                return plan
    except (json.JSONDecodeError, KeyError):
        pass

    return _fallback_plan(goal, tools_list)


def replan(original_plan: dict, error_context: dict) -> dict:
    """
    Create a new plan when a step fails.
    
    Args:
        original_plan: The original plan that failed
        error_context: What went wrong
    
    Returns:
        New plan dict with corrected steps
    """
    prompt = f"""A step in this plan failed. Create a new plan to achieve the goal.
Original plan: {json.dumps(original_plan, ensure_ascii=False)[:800]}
Failed step: {error_context.get("step_id", "unknown")}
Error: {error_context.get("error", "unknown error")}

Output a new JSON plan with the same structure as before.
Focus on alternative approaches to achieve the same goal.
Output ONLY valid JSON."""

    response = _call_llm(prompt)
    if not response:
        return original_plan

    try:
        json_start = response.find("{")
        json_end = response.rfind("}") + 1
        if json_start >= 0 and json_end > json_start:
            plan = json.loads(response[json_start:json_end])
            if "steps" in plan and len(plan["steps"]) > 0:
                return plan
    except (json.JSONDecodeError, KeyError):
        pass

    return original_plan


def list_tools() -> list:
    """Return available tool names from the actions directory."""
    actions_dir = Path(__file__).resolve().parent.parent / "actions"
    tools = []
    for f in actions_dir.glob("*.py"):
        name = f.stem
        if name.startswith("_") or name in ("config",):
            continue
        tools.append(name)
    return sorted(tools)


def _fallback_plan(goal: str, tools: list) -> dict:
    """Create a simple single-step plan when LLM is unavailable."""
    return {
        "goal": goal,
        "steps": [{
            "id": "step_1",
            "tool": "web_search",
            "action": "search",
            "args": {"query": goal},
            "description": f"Search for information about: {goal}",
            "depends_on": []
        }],
        "estimated_time": "30s",
        "risk_level": "low"
    }
