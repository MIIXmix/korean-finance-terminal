@echo off
REM Korean Finance Terminal - double-click launcher (Windows)
REM Runs the PowerShell setup/launch script with the right execution policy.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
pause
