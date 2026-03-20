@echo off
title Code Hub - Iniciando...
color 0A

echo.
echo  ----------------------------------------
echo   /-\ CODE HUB - Soporte IT
echo  ----------------------------------------
echo.

:: Ir a la carpeta del script
cd /d "%~dp0"

:: Verificar Node.js
node -v >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  [ERROR] Node.js no esta instalado.
    echo  Descargalo en: https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Instalar dependencias si faltan
if not exist "node_modules" (
    echo  Instalando dependencias por primera vez...
    echo  Esto puede tardar unos minutos.
    echo.
    call npm install
    if errorlevel 1 (
        color 0C
        echo  [ERROR] Fallo la instalacion de dependencias.
        pause
        exit /b 1
    )
)

:: Compilar la app si no existe el build
if not exist "dist\index.html" (
    echo  Compilando la app por primera vez...
    echo  Esto puede tardar 1-2 minutos.
    echo.
    call npm run build
    if errorlevel 1 (
        color 0C
        echo  [ERROR] Fallo la compilacion.
        pause
        exit /b 1
    )
)

:: Matar proceso viejo en puerto 3001 si existiera
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3001" ^| find "LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: Arrancar el servidor en segundo plano
echo  Iniciando servidor en http://localhost:3001
start "Code Hub Server" /min cmd /c "node server.js"

:: Esperar 2 segundos para que arranque
timeout /t 2 /nobreak >nul

:: Abrir el browser
echo  Abriendo el navegador...
start "" "http://localhost:3001"

echo.
echo  ----------------------------------------
echo   Code Hub corriendo en puerto 3001
echo   Comparte con tu equipo la IP de red:
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| find "IPv4"') do (
    for /f "tokens=1" %%j in ("%%i") do echo    http://%%j:3001
)
echo  ----------------------------------------
echo.
echo  Podes cerrar esta ventana.
echo  El servidor sigue corriendo en segundo plano.
echo.
pause
