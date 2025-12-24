@echo off
echo ╔══════════════════════════════════════════════════════════════╗
echo ║     HYPER UNICORN - Quick Windows Setup                      ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

REM Navigate to script directory
cd /d "%~dp0"

echo [1/5] Creating .env file...
if not exist ".env" (
    copy ".env.template" ".env"
    echo Created .env - EDIT THIS FILE WITH YOUR API KEYS!
    notepad .env
    pause
) else (
    echo .env already exists
)

echo.
echo [2/5] Creating Python virtual environment...
if not exist "venv" (
    python -m venv venv
)
call venv\Scripts\activate.bat

echo.
echo [3/5] Installing dependencies...
pip install -r requirements.txt

echo.
echo [4/5] Creating workspace directories...
mkdir workspaces\research 2>nul
mkdir workspaces\code 2>nul
mkdir workspaces\content 2>nul
mkdir workspaces\data 2>nul
mkdir workspaces\browser 2>nul
mkdir workspaces\financial 2>nul
mkdir workspaces\communication 2>nul
mkdir workspaces\ceo 2>nul
mkdir workspaces\shared 2>nul
mkdir workspaces\outputs 2>nul
mkdir data\memory 2>nul
mkdir data\knowledge_graph 2>nul
mkdir data\backups 2>nul
mkdir logs 2>nul

echo.
echo [5/5] Setup complete!
echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║     🦄 HYPER UNICORN Ready!                                  ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.
echo To start the dashboard, run:
echo   python -m streamlit run interfaces\alfred_dashboard.py
echo.
echo To start the API server, run:
echo   python api\server.py
echo.
echo To start Docker services (requires Docker Desktop):
echo   docker-compose up -d
echo.
pause
