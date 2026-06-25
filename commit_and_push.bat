@echo off
cd /d D:\JARVIS_PORTABLE
git add server.js server\tts.js server\capabilities.js server\command-router.js server\executor.js server\reminders.js package.json package-lock.json
git commit -m "feat: expand JARVIS with 49 capabilities across 14 categories

New features:
- File operations: mkdir, rename, copy, move, list, delete
- Media controls: volume, play, pause, next, previous, stop
- Smart home: lights, AC, temperature, generic devices
- System: screenshot, status, disk, memory, processes, battery, network, uptime
- Calculator: percentage, basic math operations
- Translation: MyMemory API with 16+ language aliases
- Capabilities registry: 49 actions with NL search
- Command router: expanded PT-BR command matching
- TTS: fixed to accept object params (server.js compatible)"
git push origin main
pause
