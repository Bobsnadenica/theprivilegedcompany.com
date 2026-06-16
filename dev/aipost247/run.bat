@echo off
chcp 65001 >nul
REM AIPost247 — стартиране с една команда за Windows.
REM   run.bat            -> настройва venv, инсталира зависимости, стартира приложението
REM   run.bat setup      -> всеки аргумент се подава директно към run.py
setlocal
cd /d "%~dp0"

set "VENV_DIR=.venv"

where py >nul 2>nul && (set "PY=py -3") || (set "PY=python")

if not exist "%VENV_DIR%" (
    echo [run.bat] Създаване на виртуална среда в .\%VENV_DIR% ...
    %PY% -m venv "%VENV_DIR%"
)

call "%VENV_DIR%\Scripts\activate.bat"

if not exist "%VENV_DIR%\.requirements.stamp" (
    echo [run.bat] Инсталиране на зависимости ...
    python -m pip install --upgrade pip >nul
    python -m pip install -r requirements.txt
    echo done> "%VENV_DIR%\.requirements.stamp"
) else (
    echo [run.bat] Зависимостите вече са инсталирани.
)

echo [run.bat] Стартиране на AIPost247 ...
python run.py %*
endlocal
