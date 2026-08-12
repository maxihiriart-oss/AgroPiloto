@echo off
setlocal
title Agro Copiloto v0.5.0
cd /d "%~dp0"
echo.
echo ==========================================
echo   AGRO COPILOTO v0.5.0
echo ==========================================
echo.
echo Abriendo en http://localhost:8090
echo NO cierres esta ventana mientras uses la app.
echo.
start "" /B python server.py
ping 127.0.0.1 -n 3 > nul
start "" http://localhost:8090/?v=0500
pause
