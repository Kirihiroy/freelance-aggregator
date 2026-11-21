@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo Устанавливаю зависимости...
  call npm install --no-fund --no-audit
)
start "" /min cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server.js
pause
