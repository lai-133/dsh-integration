@echo off
rem dsh-desktop one-time setup: installs runtime + web-profile plugin integrations + gallery data.
cd /d "%~dp0"
where node >nul 2>nul || (echo [ERROR] Node.js not found on PATH. Install Node.js >= 20 first. & pause & exit /b 1)
rem 国内镜像（海外用户可删除下面两行）
if not defined ELECTRON_MIRROR set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
if not defined npm_config_registry set npm_config_registry=https://registry.npmmirror.com
echo [1/3] Installing DSH runtime and Electron ^(npm install^) ...
call npm install
if errorlevel 1 (echo [ERROR] npm install failed & pause & exit /b 1)
echo [2/3] Integrating plugins into web profile ^(dsh-better-sidebar / ModLens / dsh-web-ui / dshmarket^) ...
call node scripts\setup.mjs
if errorlevel 1 (echo [ERROR] setup failed & pause & exit /b 1)
echo.
echo Done. Run start.cmd or "npm start" to launch.
pause
