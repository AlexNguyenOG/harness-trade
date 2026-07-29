@echo off
REM Keep http://127.0.0.1:3001/terminal alive in this window.
REM If Vite crashes or is killed, this loop restarts it.
REM Close this window ONLY when you want the server to stop.
cd /d "%~dp0\.."
title Harness portal :3001 (KEEP ALIVE)

:loop
echo.
echo [%date% %time%] starting keep-portal-dev.ps1 ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0keep-portal-dev.ps1" 3001
echo [%date% %time%] keeper exited with code %ERRORLEVEL% — restarting in 2s
timeout /t 2 /nobreak >nul
goto loop
