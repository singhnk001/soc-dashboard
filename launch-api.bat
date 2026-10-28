@echo off
color 0B
title SOC Core API :8002
cd /d D:\SOC-Dashboard\Dashboard
set PYTHONPATH=D:\SOC-Dashboard\Dashboard
echo.
echo  Starting SOC Core API on port 8002...
echo  Working dir: %CD%
echo.
C:\Users\niles\AppData\Local\Programs\Python\Python315\python.exe -m uvicorn api.index:app --host 0.0.0.0 --port 8002 --workers 1
echo.
echo  ===================================================
echo   API exited with code: %ERRORLEVEL%
echo   This window will stay open so you can see errors.
echo  ===================================================
echo.
pause
