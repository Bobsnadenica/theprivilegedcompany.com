@echo off
REM AIPost247 - one-click launcher for Windows.
REM   run.bat            -> set up venv, install deps, open the dashboard
REM   run.bat setup      -> any argument is passed straight to run.py
REM Note: messages here are ASCII so cmd.exe never mis-parses them. The app
REM itself (and the web dashboard) is in Bulgarian via Python's UTF-8 output.
chcp 65001 >nul
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
setlocal
cd /d "%~dp0"

set "VENV_DIR=.venv"

where py >nul 2>nul && (set "PY=py -3") || (set "PY=python")

if not exist "%VENV_DIR%\Scripts\activate.bat" (
    echo [run.bat] Creating virtual environment in .\%VENV_DIR% ...
    %PY% -m venv "%VENV_DIR%"
)

call "%VENV_DIR%\Scripts\activate.bat"

if not exist "%VENV_DIR%\.requirements.stamp" (
    echo [run.bat] Installing dependencies ...
    python -m pip install --upgrade pip >nul
    python -m pip install -r requirements.txt
    echo done> "%VENV_DIR%\.requirements.stamp"
) else (
    echo [run.bat] Dependencies already installed.
)

echo [run.bat] Starting AIPost247 ...
python run.py %*
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" (
    echo [run.bat] AIPost247 exited with code %RC% - see the message above.
    echo [run.bat] Tip - to log in to your AI provider:  run.bat login-gemini
) else (
    echo [run.bat] AIPost247 finished.
)
echo [run.bat] Press any key to close this window ...
pause >nul
endlocal
