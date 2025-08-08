@echo off
echo ====================================================
echo  Super Mega Inc - Autonomous GitHub Development Team
echo ====================================================
echo.

echo Starting autonomous development agents...
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.7+ and try again
    pause
    exit /b 1
)

REM Install required packages if needed
echo Installing required packages...
pip install requests pyyaml asyncio >nul 2>&1

echo.
echo ✅ Starting Autonomous Development Team...
echo.
echo The team will:
echo   🔍 Monitor website: https://swanhtet01.github.io/
echo   🔄 Auto-commit changes every 30 minutes  
echo   🚀 Auto-deploy to GitHub Pages
echo   📊 Generate status reports
echo.
echo Press Ctrl+C to stop the autonomous team
echo.

REM Start the autonomous development team
python autonomous_github_dev_team.py

echo.
echo Autonomous development team stopped.
pause
