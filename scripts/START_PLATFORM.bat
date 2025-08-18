@echo off
echo.
echo ===================================
echo    AI Agent Platform - Quick Start
echo ===================================
echo.

echo Installing dependencies...
pip install -r requirements.txt

echo.
echo Starting AI Platform...
echo.
echo Web interface will be available at: http://localhost:5000
echo Press Ctrl+C to stop the platform
echo.

python ai_platform.py
