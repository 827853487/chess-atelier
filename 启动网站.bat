@echo off
chcp 65001 >nul
cd /d "%~dp0"
py -3 --version >nul 2>&1
if not errorlevel 1 goto RUN_PY
python --version >nul 2>&1
if not errorlevel 1 goto RUN_PYTHON
echo Python 3.10 or newer was not found.
echo Install Python from https://www.python.org/downloads/ and enable Add Python to PATH.
pause
exit /b 1
:RUN_PY
py -3 launch.py
if errorlevel 1 (
  echo Startup failed. Please copy the error message above.
  pause
)
exit /b
:RUN_PYTHON
python launch.py
if errorlevel 1 (
  echo Startup failed. Please copy the error message above.
  pause
)
exit /b
