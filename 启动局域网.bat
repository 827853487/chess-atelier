@echo off
chcp 65001 >nul
cd /d "%~dp0"
py -3 launch_lan.py
if errorlevel 1 python launch_lan.py
if errorlevel 1 pause
