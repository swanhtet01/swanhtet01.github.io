@echo off
REM 🚀 AUTONOMOUS WINDOWS ORCHESTRATOR
REM PowerShell-based orchestrator for Windows environments

echo 🚀 AUTONOMOUS WINDOWS ORCHESTRATOR V3.0
echo =====================================

REM Create necessary directories
if not exist "logs" mkdir logs
if not exist "data" mkdir data

echo 📁 Directory structure ready

REM Start multiple autonomous processes in separate windows
echo 🔄 Starting autonomous processes...

REM Start Continuous Autonomous System
start "Continuous Autonomous System" cmd /k "echo 🤖 Continuous Autonomous System Starting... & python continuous_autonomous_system.py"

REM Wait 2 seconds between starts
timeout /t 2 /nobreak >nul

REM Start CLI Orchestrator  
start "CLI Orchestrator" cmd /k "echo 🔧 CLI Orchestrator Starting... & python autonomous_cli_orchestrator.py"

timeout /t 2 /nobreak >nul

REM Start Original Strategic System
start "Strategic System" cmd /k "echo ⚡ Strategic System Starting... & cd CloudAIAgent & python supercharged_strategic_system_fixed.py"

timeout /t 2 /nobreak >nul

REM Start SocialAI System
start "SocialAI System" cmd /k "echo 📱 SocialAI System Starting... & python socialai_system.py"

timeout /t 2 /nobreak >nul

REM Start Status Dashboard
start "Status Dashboard" cmd /k "echo 📊 Status Dashboard Starting... & python project_status_dashboard.py"

timeout /t 2 /nobreak >nul

REM Start Log Monitor
start "Log Monitor" cmd /k "echo 📋 Log Monitor Starting... & powershell -Command 'Get-Content autonomous_continuous.log, autonomous_cli.log -Wait'"

echo ✅ All autonomous systems started!
echo 📋 Active Windows:
echo    - Continuous Autonomous System
echo    - CLI Orchestrator  
echo    - Strategic System
echo    - SocialAI System
echo    - Status Dashboard
echo    - Log Monitor
echo.
echo 🎯 All systems are now running autonomously
echo 🔄 Auto-continuation is ENABLED - no user input required
echo 🛑 To stop all: run stop_autonomous_windows.bat
echo.

pause
