@echo off
setlocal

set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..") do set PROJECT_ROOT=%%~fI
set NODE_BIN=C:\Program Files\nodejs\node.exe

cd /d "%PROJECT_ROOT%"

if not exist "%NODE_BIN%" (
  echo Node was not found at:
  echo %NODE_BIN%
  echo.
  echo Install Node.js or edit scripts\start_app.bat to point to your node.exe.
  pause
  exit /b 1
)

set HOST=127.0.0.1
set PORT=8000
set MYSQL_HOST=127.0.0.1
set MYSQL_PORT=3306
set MYSQL_USER=root
set MYSQL_PASSWORD=
set MYSQL_DATABASE=dorotracker

echo Starting DoroTracker on http://127.0.0.1:8000
echo This launcher expects a working local MySQL server on 127.0.0.1:3306.
echo Press Ctrl+C to stop the server.
echo.

start "" "http://127.0.0.1:8000"

"%NODE_BIN%" server\index.js
