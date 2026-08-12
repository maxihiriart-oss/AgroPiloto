@echo off
title Agro Copiloto - Instalacion
cd /d "%~dp0"
echo.
echo ==========================================
echo   AGRO COPILOTO v0.3.1 - INSTALACION
echo ==========================================
echo.
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
echo.
echo Instalacion terminada.
echo Ahora hace doble clic en ABRIR_APP.bat
echo.
pause
