@echo off
title SOC Dashboard - Startup
color 0A
setlocal EnableDelayedExpansion

REM ============================================================
REM  SOC Dashboard - Full Stack Startup
REM  API      : http://localhost:8002
REM  UI       : http://localhost:3000
REM  DB       : PostgreSQL :5432
REM  Collector: Vector :8687
REM ============================================================

set "DASHBOARD_DIR=D:\SOC-Dashboard\Dashboard"
set "PYTHON=C:\Users\niles\AppData\Local\Programs\Python\Python315\python.exe"
set "VECTOR_EXE=D:\SOC-Dashboard\Dashboard\vector\bin\vector.exe"
set "VECTOR_CFG=%DASHBOARD_DIR%\vector\vector-soc-collector.toml"

echo.
echo  ==========================================
echo    SOC Dashboard - Starting All Services
echo  ==========================================
echo.

REM ── 0. Kill stale processes ────────────────────────────────
echo [0/5] Cleaning up stale processes...

REM Kill stale Python on 8001/8002
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr ":8002 " ^| findstr "LISTENING"') do (
    tasklist /fi "PID eq %%P" 2>nul | findstr /i "python" >nul && (
        echo        Killing stale Python PID %%P on :8002
        taskkill /PID %%P /F >nul 2>&1
    )
)
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr ":8001 " ^| findstr "LISTENING"') do (
    tasklist /fi "PID eq %%P" 2>nul | findstr /i "python" >nul && (
        echo        Killing stale Python PID %%P on :8001
        taskkill /PID %%P /F >nul 2>&1
    )
)

REM Kill stale Node on 3000
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    tasklist /fi "PID eq %%P" 2>nul | findstr /i "node" >nul && (
        echo        Killing stale Node PID %%P on :3000
        taskkill /PID %%P /F >nul 2>&1
    )
)
timeout /t 2 /nobreak >nul
echo        Done.

REM ── 1. PostgreSQL ──────────────────────────────────────────
echo [1/5] Checking PostgreSQL :5432...
netstat -ano 2>nul | findstr ":5432 " | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo        Already running - OK
) else (
    echo        Starting PostgreSQL service...
    net start postgresql-x64-18 >nul 2>&1
    if !errorlevel!==0 (
        echo        Started (v18)
    ) else (
        net start postgresql-x64-17 >nul 2>&1
        if !errorlevel!==0 (
            echo.
            echo  [ERROR] PostgreSQL not running and could not auto-start.
            echo          Open an Administrator CMD and run:
            echo            net start postgresql-x64-18
            echo.
            pause
            exit /b 1
        ) else (
            echo        Started (v17)
        )
    )
)

REM ── 2. Vector Log Collector ────────────────────────────────
echo [2/5] Checking Vector collector :8687...
netstat -ano 2>nul | findstr ":8687 " | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo        Already running - OK
) else (
    if exist "%VECTOR_EXE%" (
        start "SOC-Vector" /min "%VECTOR_EXE%" --config "%VECTOR_CFG%"
        timeout /t 3 /nobreak >nul
        echo        Launched (minimized window)
    ) else (
        echo        [SKIP] Vector binary not found at %VECTOR_EXE%
    )
)

REM ── 3. Core API :8002 ──────────────────────────────────────
echo [3/5] Starting Core API :8002...
start "SOC-API" cmd /k "%DASHBOARD_DIR%\launch-api.bat"
echo        Waiting 12s for API to initialize...
timeout /t 12 /nobreak >nul

REM ── 4. Next.js Frontend :3000 ──────────────────────────────
echo [4/5] Starting Next.js Frontend :3000...
start "SOC-UI" cmd /k "%DASHBOARD_DIR%\launch-ui.bat"
echo        Launched - compiling (takes ~30s first time)...
echo        Waiting 20s for Next.js to be ready...
timeout /t 20 /nobreak >nul

REM ── 5. Health summary ──────────────────────────────────────
echo.
echo [5/5] Status check...
netstat -ano 2>nul | findstr ":8002 " | findstr "LISTENING" >nul
if %errorlevel%==0 (echo        [OK] API :8002) else (echo        [!!] API :8002 NOT running - check SOC-API window)

netstat -ano 2>nul | findstr ":3000 " | findstr "LISTENING" >nul
if %errorlevel%==0 (echo        [OK] UI  :3000) else (echo        [!!] UI  :3000 not ready yet - give it 30s more)

netstat -ano 2>nul | findstr ":5432 " | findstr "LISTENING" >nul
if %errorlevel%==0 (echo        [OK] DB  :5432) else (echo        [!!] DB  :5432 NOT running)

echo.
echo  ==========================================
echo    All services launched!
echo  ==========================================
echo.
echo    Dashboard  :  http://localhost:3000
echo    Core API   :  http://localhost:8002/docs
echo    PostgreSQL :  localhost:5432
echo    Vector     :  http://localhost:8687/health
echo.
echo    Login: admin / admin123
echo.
echo    Press any key to close this window.
echo    (Services keep running in their own windows)
echo.
pause >nul
endlocal
