@echo off
rem Windows: instala (la primera vez) y arranca el Reproductor IPTV. Doble clic para usarlo.
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Falta Node.js, el programa que hace funcionar la aplicacion.
  where winget >nul 2>nul
  if errorlevel 1 (
    echo Instalalo desde https://nodejs.org y vuelve a hacer doble clic en este archivo.
    start https://nodejs.org
  ) else (
    echo Lo instalo ahora. Acepta las ventanas que aparezcan.
    winget install -e --id OpenJS.NodeJS.LTS
    echo.
    echo Hecho. Cierra esta ventana y vuelve a hacer doble clic en este archivo.
  )
  pause
  exit /b 1
)
node iniciar.mjs
pause
