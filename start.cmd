@echo off
rem dsh-desktop launcher: starts the desktop app.
cd /d "%~dp0"
where node >nul 2>nul || (echo [ERROR] Node.js not found on PATH. Install Node.js >= 20 first. & pause & exit /b 1)
if not exist "node_modules\@deepseek-ai\dsh" (
  echo [INFO] First run: installing dependencies ^(npm install^) ...
  call npm install
  if errorlevel 1 (echo [ERROR] npm install failed & pause & exit /b 1)
)
if not exist "src\gallery\plugins.json" (
  echo [INFO] First run: generating plugin gallery data ...
  call npm run gallery:build
)
call npm start
