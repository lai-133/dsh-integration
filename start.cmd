@echo off
rem dsh-desktop launcher: auto-installs missing deps, auto-runs setup, then starts the app.
cd /d "%~dp0"
where node >nul 2>nul || (echo [ERROR] Node.js not found on PATH. Install Node.js >= 20 first. & pause & exit /b 1)
if not exist "node_modules\@deepseek-ai\dsh" (
  echo [INFO] First run: installing dependencies ^(npm install^) ...
  call npm install
  if errorlevel 1 (echo [ERROR] npm install failed & pause & exit /b 1)
)
if not exist ".setup-complete" (
  echo [INFO] First run: preparing web profile ^(auto-initializes ~/.dsh, pnpm and plugins^) ...
  call npm run setup
  if errorlevel 1 (echo [ERROR] setup failed & pause & exit /b 1)
)
call npm start
