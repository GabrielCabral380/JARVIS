@echo off
chcp 65001 >nul
title Atualizar JARVIS
cd /d "%~dp0"
npm run update
pause
