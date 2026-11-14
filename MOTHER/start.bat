@echo off
rem MOTHER - double-click to start. First run installs everything and asks for the database password.
rem   start.bat --setup   re-enter the database login
cd /d "%~dp0"
title MOTHER

set "PY=python"
where py >nul 2>nul && set "PY=py -3"

if not exist ".venv\Scripts\python.exe" (
  echo [MOTHER] First run: creating the Python environment ^(1-2 minutes^)...
  %PY% -m venv .venv
  if errorlevel 1 goto nopython
)
echo [MOTHER] Checking Python packages...
".venv\Scripts\python.exe" -m pip install --quiet --disable-pip-version-check -r requirements.txt
if errorlevel 1 goto failed

if "%~1"=="--setup" goto setup
if not exist ".env" goto setup
goto run

:setup
".venv\Scripts\python.exe" -m mother.configure

:run
".venv\Scripts\python.exe" -m mother.server
pause
exit /b 0

:nopython
echo.
echo [MOTHER] Python 3.10 or newer is required: https://www.python.org/downloads/
echo          During installation tick "Add python.exe to PATH", then run start.bat again.
pause
exit /b 1

:failed
echo.
echo [MOTHER] Installing packages failed - check your internet connection and run start.bat again.
pause
exit /b 1
