@echo off
echo ===============================================================
echo   SUPER MEGA META AUTO DEV TEAM - FACEBOOK & INSTAGRAM FOCUS
echo ===============================================================
echo.

echo 🚀 Starting Meta-focused autonomous development team...
echo 📘 Facebook automation for Super Mega Social AI platform
echo 📷 Instagram content generation and scheduling
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ ERROR: Python is not installed or not in PATH
    echo Please install Python 3.7+ and try again
    pause
    exit /b 1
)

echo ✅ Python detected
echo.

REM Install required packages
echo 📦 Installing required packages...
pip install requests asyncio >nul 2>&1

REM Check if Meta API keys are configured
echo 🔑 Checking API configuration...
if not exist .env.meta (
    echo ⚠️  WARNING: .env.meta file not found
    echo Please configure your Meta API keys in .env.meta
    echo.
    echo Required settings:
    echo - FACEBOOK_ACCESS_TOKEN
    echo - FACEBOOK_PAGE_ID  
    echo - INSTAGRAM_ACCESS_TOKEN
    echo - INSTAGRAM_ACCOUNT_ID
    echo.
    echo The team will run in SIMULATION MODE until keys are configured.
    echo.
    pause
)

echo.
echo ══════════════════════════════════════════════════════════════
echo                        READY TO START
echo ══════════════════════════════════════════════════════════════
echo.
echo 🎯 The Meta Auto Dev Team will:
echo    • Generate AI content for Facebook and Instagram
echo    • Focus on Super Mega Social AI tool promotion
echo    • Create engaging posts about business automation
echo    • Track performance and optimize content
echo    • Run 24/7 autonomous content operations
echo.
echo 🛡️  SAFETY FEATURES:
echo    • Content review and approval system
echo    • API rate limiting protection  
echo    • Performance analytics and reporting
echo    • Automatic backup and recovery
echo.
echo Press Ctrl+C to stop the team at any time
echo.
echo Starting in 5 seconds...
timeout /t 5 >nul

echo.
echo 🚀 LAUNCHING META AUTO DEV TEAM...
echo.

REM Start the Meta autonomous development team
python meta_auto_dev_team.py

echo.
echo 👋 Meta Auto Dev Team stopped.
echo Check meta_auto_dev.log for detailed logs
echo Check meta_performance_report.json for analytics
echo.
pause
