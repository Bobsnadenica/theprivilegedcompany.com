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

set "REQ_HASH="
for /f "skip=1 tokens=* delims=" %%H in ('certutil -hashfile requirements.txt SHA256 2^>nul') do (
    if not defined REQ_HASH set "REQ_HASH=%%H"
)
set "REQ_HASH=%REQ_HASH: =%"
set "STAMP_HASH="
if exist "%VENV_DIR%\.requirements.stamp" set /p STAMP_HASH=<"%VENV_DIR%\.requirements.stamp"

if not defined REQ_HASH (
    echo [run.bat] Could not calculate the requirements hash.
    goto install_failed
)

if /I not "%REQ_HASH%"=="%STAMP_HASH%" (
    echo [run.bat] Installing dependencies ...
    python -m pip install --upgrade pip >nul || goto install_failed
    python -m pip install -r requirements.txt || goto install_failed
    >"%VENV_DIR%\.requirements.stamp" echo %REQ_HASH%
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
if not defined AIPOST247_NO_PAUSE pause >nul
endlocal & exit /b %RC%

:install_failed
echo.
echo [run.bat] Dependency installation failed. The success stamp was not written.
echo [run.bat] Fix the error above, then run this file again.
if not defined AIPOST247_NO_PAUSE pause >nul
endlocal & exit /b 1
