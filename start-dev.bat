@echo off
setlocal
chcp 65001 >nul
set "SCRIPT_DIR=%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start-dev.ps1"

if errorlevel 1 (
  echo.
  echo Start failed. Check error output above.
  pause
)

