@echo off
REM AIPost247 one-command launcher for Windows.
REM   run.bat            -> set up venv, install deps, start the app
REM   run.bat setup      -> any argument is passed straight to run.py
setlocal
cd /d "%~dp0"

set "VENV_DIR=.venv"

where py >nul 2>nul && (set "PY=py -3") || (set "PY=python")

if not exist "%VENV_DIR%" (
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
endlocal
