@echo off
setlocal
title DANDI MVP
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [DANDI] Node.js is not installed. Please install the LTS version from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

if not exist "server\node_modules" goto install
if not exist "client\node_modules" goto install
goto env

:install
echo [DANDI] Installing packages for the first run. This can take a few minutes...
call npm install --prefix server
if errorlevel 1 goto installfail
call npm install --prefix client
if errorlevel 1 goto installfail
goto env

:installfail
echo [DANDI] Package installation failed. Please check your internet connection and try again.
pause
exit /b 1

:env
if not exist "server\.env" (
  copy "server\.env.example" "server\.env" >nul
  echo [DANDI] Created server\.env - default is DEMO mode, no API key needed.
)

echo [DANDI] Starting... the browser will open in a few seconds. Press Ctrl+C to stop.
start "" cmd /c "timeout /t 8 >nul & start http://localhost:5173"
call npm run dev
pause
