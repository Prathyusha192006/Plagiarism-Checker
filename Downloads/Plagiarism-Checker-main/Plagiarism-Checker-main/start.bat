@echo off
title ScribeGuard - Plagiarism Detector
color 0A

echo.
echo  ==========================================
echo       ScribeGuard - Plagiarism Detector
echo         Powered by FastAPI + Python
echo  ==========================================
echo.

cd /d "%~dp0"

echo [1/2] Checking dependencies...
pip install -r requirements.txt -q
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)
echo [1/2] Dependencies OK.
echo.

echo [2/2] Starting server...
echo.
echo  Open your browser at:  http://localhost:8000
echo.
echo  Press CTRL+C to stop the server.
echo.

python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload

pause
