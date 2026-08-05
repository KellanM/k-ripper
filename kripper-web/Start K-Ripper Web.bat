@echo off
title K-Ripper Web
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   K-Ripper Web needs Node.js ^(v18 or newer^).
  echo   Install it from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)
for /f "delims=v. tokens=1,2" %%a in ('node -v') do set NODE_MAJOR=%%a
if %NODE_MAJOR% LSS 18 (
  echo   Your Node.js is too old ^(need v18+^). Update at https://nodejs.org
  pause
  exit /b 1
)
node server.mjs --open
pause
