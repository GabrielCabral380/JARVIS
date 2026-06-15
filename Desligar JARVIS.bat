@echo off
chcp 65001 >nul
title Desligar JARVIS
echo Encerrando processos node que usam server.js...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'server.js' -and $_.Name -match 'node' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host 'Parado PID' $_.ProcessId }"
pause
