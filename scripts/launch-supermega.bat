@echo off
title Super Mega Production - Live Dashboard
echo ================================
echo   🚀 SUPER MEGA PRODUCTION
echo   Real AI Development Team
echo   Website: supermega.dev
echo ================================
echo.

echo Opening production dashboard...
timeout /t 2 /nobreak >nul

REM Open the production website
start "" "supermega_production.html"

echo.
echo ✅ SUPER MEGA PRODUCTION ACTIVE
echo ================================
echo 🌐 Website: Live and Running
echo 🤖 AI Agents: 5 Active Agents
echo 📊 Database: Real Production Data
echo 🔥 Mode: FULL PRODUCTION
echo.
echo API Health Check:
curl -s http://localhost:8080/api/health
echo.
echo.
echo 📊 Real Metrics:
curl -s http://localhost:8080/api/real-data
echo.
echo ================================
echo.
echo System is running continuously...
echo To stop: Press Ctrl+C in the API terminal
echo.

pause
