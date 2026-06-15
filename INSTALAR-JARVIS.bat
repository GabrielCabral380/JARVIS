@echo off
chcp 65001 >nul
title Instalar JARVIS Local Hub
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1"
pause
