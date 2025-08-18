@echo off
echo 🚀 Starting Super Mega Agent Chat Server...
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python is not installed or not in PATH
    echo Please install Python 3.8 or higher
    pause
    exit /b 1
)

echo ✅ Python found
echo.

REM Install requirements if needed
echo 📦 Installing required packages...
pip install -r agent_chat_requirements.txt --quiet

if errorlevel 1 (
    echo ⚠️  Warning: Could not install some packages
    echo The server may still work with existing packages
    echo.
)

echo.
echo 🔥 Launching Agent Chat Server...
echo 📡 Server will be available at: http://localhost:5000
echo 🤖 Agent chat interface: http://localhost:5000/agent-chat
echo.
echo Press Ctrl+C to stop the server
echo.

REM Start the server
python agent_chat_server.py

echo.
echo 👋 Server stopped
pause
