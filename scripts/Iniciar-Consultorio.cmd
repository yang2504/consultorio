@echo off
setlocal DisableDelayedExpansion
if not exist "%~dp0runtime\node.exe" goto incomplete
if not exist "%~dp0backend\src\server.js" goto incomplete
if not exist "%~dp0frontend\dist\index.html" goto incomplete
"%~dp0runtime\node.exe" "%~dp0backend\src\server.js" --open %*
if not errorlevel 1 exit /b 0
pause
exit /b 1
:incomplete
echo Extrae todo el ZIP y abre este archivo desde la carpeta extraida.
pause
exit /b 1
