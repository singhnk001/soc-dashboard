@echo off
color 0E
title SOC Frontend :3000
cd /d D:\SOC-Dashboard\Dashboard
echo.
echo  Starting SOC Next.js Frontend on port 3000...
echo  Working dir: %CD%
echo.
npm run dev
echo.
echo  ===================================================
echo   Frontend exited with code: %ERRORLEVEL%
echo   This window will stay open so you can see errors.
echo  ===================================================
echo.
pause
