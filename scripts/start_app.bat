@echo off
setlocal

set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..") do set PROJECT_ROOT=%%~fI

cd /d "%PROJECT_ROOT%"

echo Starting DoroTracker at http://127.0.0.1:8000
echo Press Ctrl+C in this window to stop the server.
echo.

set PYTHONPATH=backend
python backend\server.py
