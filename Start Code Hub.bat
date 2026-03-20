@echo off
title Code Hub — Iniciando...
cd /d "%~dp0"

:: Verificar Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js no encontrado. Instala Node.js y volvé a intentar.
    pause
    exit /b 1
)

:: Compilar si no existe la carpeta dist
if not exist "dist\" (
    echo Compilando Code Hub por primera vez, espera un momento...
    call npm run build
    if errorlevel 1 (
        echo [ERROR] Fallo la compilacion.
        pause
        exit /b 1
    )
)

:: Obtener IP de red local
set LAN_URL=
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /R "IPv4"') do (
    set RAW=%%A
    setlocal enabledelayedexpansion
    set RAW=!RAW: =!
    if not defined LAN_URL set LAN_URL=!RAW!
    endlocal & set LAN_URL=%LAN_URL%
)

:: Abrir el navegador despues de 2 segundos
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3001"

:: Levantar servidor
title Code Hub — Corriendo
echo.
echo  =============================================
echo   Code Hub
echo   Local    ^>  http://localhost:3001
if defined LAN_URL (
    echo   Red      ^>  http://%LAN_URL%:3001
    echo             ^(compartir esta URL con tus colegas^)
)
echo   Cerra esta ventana para apagar el servidor.
echo  =============================================
echo.
node server.js
