@echo off
title Code Hub - Actualizar App
color 0B
cd /d "%~dp0"

echo.
echo  Recompilando la app con los ultimos cambios...
echo.

call npm run build

if errorlevel 1 (
    color 0C
    echo  [ERROR] Fallo la compilacion. Revisa los errores arriba.
    pause
    exit /b 1
)

echo.
echo  [OK] App actualizada correctamente.
echo  Reinicia el servidor (cierra y vuelve a abrir ABRIR-HUB.bat)
echo.
pause
