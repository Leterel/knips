@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Bitte Node.js 24.14 oder neuer aus der 24er Reihe installieren.
  pause
  exit /b 1
)
echo Die angezeigte lokale Adresse im Browser oeffnen.
node tools/demo.mjs
if errorlevel 1 pause
