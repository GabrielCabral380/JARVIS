@echo off
chcp 65001 >nul
title Ligar JARVIS
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale Node.js LTS e rode INSTALAR-JARVIS.bat.
  pause
  exit /b 1
)

where py >nul 2>nul
if errorlevel 1 (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python nao encontrado. O JARVIS vai iniciar com fallback Node, mas algumas automacoes locais podem ficar limitadas.
  )
)

if not exist ".env" (
  if exist ".env.example" (
    copy /Y ".env.example" ".env" >nul
    echo .env criado automaticamente a partir de .env.example
  ) else (
    echo Arquivo .env.example nao encontrado.
    pause
    exit /b 1
  )
)

node server.js
pause
