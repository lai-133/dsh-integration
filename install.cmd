@echo off
rem dsh-desktop one-time setup: installs runtime + web-profile plugin integrations + gallery data.
cd /d "%~dp0"
where node >nul 2>nul || (echo [ERROR] Node.js not found on PATH. Install Node.js >= 20 first. & pause & exit /b 1)
echo [1/3] Installing DSH runtime and Electron ^(npm install^) ...
call npm install
if errorlevel 1 (echo [ERROR] npm install failed & pause & exit /b 1)
echo [2/3] Integrating plugins into web profile ^(dsh-better-sidebar / ModLens / dsh-web-ui / dshmarket^) ...
call node scripts\setup.mjs
if errorlevel 1 (echo [ERROR] setup failed & pause & exit /b 1)
echo.
echo Done. Run start.cmd or "npm start" to launch.
pause
