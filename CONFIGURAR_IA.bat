@echo off
title Agro Copiloto - Configurar IA
cd /d "%~dp0"
echo.
echo Este archivo sirve para guardar la clave de IA SOLO en tu Windows.
echo La clave no se escribe dentro de la app.
echo.
set /p KEY=Pegá tu OPENAI_API_KEY y apreta Enter: 
setx OPENAI_API_KEY "%KEY%"
echo.
echo Clave guardada en Windows.
echo CERRA Agro Copiloto y volve a abrir ABRIR_APP.bat para que tome el cambio.
echo.
pause
