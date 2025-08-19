@echo off
echo ========================================
echo    SUPERMEGA AI PLATFORM DEPLOYMENT
echo ========================================
echo.

echo [INFO] Starting AI Services Platform...
echo.

echo [1/6] Starting Service Launcher (Main Dashboard)...
start "SuperMega Services" cmd /k "python supermega_services_launcher.py"
timeout /t 3 /nobreak >nul

echo [2/6] Starting AI Browser Automation...
start "Browser Automation" cmd /k "streamlit run simple_browser_automation.py --server.port 8504"
timeout /t 2 /nobreak >nul

echo [3/6] Starting AI Media Studio...
start "Media Studio" cmd /k "streamlit run ai_media_studio.py --server.port 8505"
timeout /t 2 /nobreak >nul

echo [4/6] Starting AI Voice Studio...
start "Voice Studio" cmd /k "streamlit run ai_voice_studio.py --server.port 8506"
timeout /t 2 /nobreak >nul

echo [5/6] Starting AI CAD Studio...
start "CAD Studio" cmd /k "streamlit run ai_cad_studio.py --server.port 8508"
timeout /t 2 /nobreak >nul

echo [6/6] Starting AI Text Studio...
start "Text Studio" cmd /k "streamlit run ai_text_studio.py --server.port 8509"
timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo    ALL SERVICES STARTED SUCCESSFULLY!
echo ========================================
echo.
echo Access the platform at:
echo   Main Dashboard: http://localhost:8501
echo   Browser Automation: http://localhost:8504  
echo   Media Studio: http://localhost:8505
echo   Voice Studio: http://localhost:8506
echo   CAD Studio: http://localhost:8508
echo   Text Studio: http://localhost:8509
echo.
echo Press any key to open main dashboard...
pause >nul

start http://localhost:8501
