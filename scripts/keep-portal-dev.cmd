@echo off
REM Double-click or run from Explorer to keep http://127.0.0.1:3001/terminal alive
REM in its own window (survives Cursor agent shells closing).
cd /d "%~dp0\.."
title Harness portal :3001
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0keep-portal-dev.ps1" 3001
pause
