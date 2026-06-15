#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
JARVIS Local Tools Bridge
Executa automações locais simples e seguras sem depender de IA, Hermes ou OpenClaw.
Entrada: argumento JSON com {"action": "..."}.
Saída: JSON em stdout.
"""
from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import sys
import webbrowser
from pathlib import Path
from urllib.parse import quote_plus


BLOCKED = ("rm -rf", "del /s", "format ", "diskpart", "reg delete", "net user")


def reply(ok: bool, text: str, **extra) -> None:
    payload = {"ok": ok, "text": text}
    payload.update(extra)
    print(json.dumps(payload, ensure_ascii=False))


def safe_text(value: object) -> str:
    text = str(value or "")
    lower = text.lower()
    if any(x in lower for x in BLOCKED):
        raise RuntimeError("Comando bloqueado por segurança.")
    return text.strip()


def is_windows() -> bool:
    return platform.system().lower() == "windows"


def start_process(args: list[str], shell: bool = False) -> None:
    if is_windows():
        subprocess.Popen(
            args if not shell else " ".join(args),
            shell=shell,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
        )
    else:
        subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)


def open_browser(browser: str = "default", url: str = "https://www.google.com") -> None:
    browser = safe_text(browser or "default").lower()
    url = safe_text(url or "https://www.google.com")

    if browser in ("default", "navegador", "browser"):
        webbrowser.open(url, new=2)
        return

    if is_windows():
        candidates = {
            "chrome": [
                os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
                os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
                os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
            ],
            "edge": [
                os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
                os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
            ],
            "firefox": [
                os.path.expandvars(r"%ProgramFiles%\Mozilla Firefox\firefox.exe"),
                os.path.expandvars(r"%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe"),
            ],
        }.get(browser, [])
        for exe in candidates:
            if exe and Path(exe).exists():
                start_process([exe, url])
                return

    exe = shutil.which(browser)
    if exe:
        start_process([exe, url])
        return

    webbrowser.open(url, new=2)


def open_app(app: str) -> None:
    app = safe_text(app).lower()
    if not app:
        raise RuntimeError("Aplicativo ausente.")

    if is_windows():
        known = {
            "calculator": "calc.exe",
            "calculadora": "calc.exe",
            "calc": "calc.exe",
            "notepad": "notepad.exe",
            "bloco de notas": "notepad.exe",
            "explorer": "explorer.exe",
            "explorador": "explorer.exe",
            "paint": "mspaint.exe",
            "mspaint": "mspaint.exe",
            "cmd": "cmd.exe",
            "powershell": "powershell.exe",
            "terminal": "wt.exe",
            "vscode": "code.cmd",
            "visual studio code": "code.cmd",
        }
    else:
        known = {
            "calculator": "gnome-calculator",
            "calculadora": "gnome-calculator",
            "notepad": "gedit",
            "bloco de notas": "gedit",
            "explorer": "xdg-open",
            "explorador": "xdg-open",
            "terminal": "x-terminal-emulator",
            "vscode": "code",
            "visual studio code": "code",
        }

    exe = known.get(app, app)
    if exe in ("xdg-open",):
        start_process([exe, str(Path.home())])
        return

    resolved = shutil.which(exe) or exe
    start_process([resolved])


def main() -> int:
    try:
        raw = sys.argv[1] if len(sys.argv) > 1 else "{}"
        data = json.loads(raw)
        action = safe_text(data.get("action", ""))

        if action == "open_browser":
            browser = data.get("browser", "default")
            url = data.get("url", "https://www.google.com")
            open_browser(str(browser), str(url))
            reply(True, "Navegador aberto.", action=action)
            return 0

        if action == "open_url":
            url = safe_text(data.get("url", "https://www.google.com"))
            label = safe_text(data.get("label", "Página"))
            open_browser("default", url)
            reply(True, f"{label} aberto no navegador.", action=action, url=url)
            return 0

        if action == "youtube_search":
            query = safe_text(data.get("query", ""))
            if not query:
                open_browser("default", "https://www.youtube.com")
                reply(True, "YouTube aberto.", action=action, url="https://www.youtube.com")
                return 0
            url = f"https://www.youtube.com/results?search_query={quote_plus(query)}"
            open_browser("default", url)
            reply(True, f"Abrindo YouTube para: {query}", action=action, url=url)
            return 0

        if action == "search_web":
            query = safe_text(data.get("query", ""))
            if not query:
                raise RuntimeError("Pesquisa vazia.")
            url = f"https://www.google.com/search?q={quote_plus(query)}"
            open_browser("default", url)
            reply(True, f"Pesquisa aberta: {query}", action=action, url=url)
            return 0

        if action == "open_app":
            app = safe_text(data.get("app", ""))
            open_app(app)
            reply(True, f"Programa aberto: {app}.", action=action)
            return 0

        if action == "system_info":
            reply(
                True,
                "Runtime local detectado.",
                action=action,
                python=sys.version.split()[0],
                platform=platform.platform(),
                node_hint="Node é validado pelo servidor JARVIS.",
            )
            return 0

        reply(False, f"Ação local não reconhecida: {action}", action=action)
        return 2
    except Exception as exc:
        reply(False, str(exc))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
