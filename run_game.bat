@echo off
title Death Race 3D
cd /d "%~dp0"
echo ===================================================
echo   DEATH RACE 3D - Vehicular Combat Circuit
echo ===================================================
echo   Serving local web server at http://localhost:8080
echo   Opening in your default browser...
echo.
echo   Press Ctrl+C in this window when you want to quit.
echo ===================================================
start "" "http://localhost:8080/death-race.html"
python -m http.server 8080
