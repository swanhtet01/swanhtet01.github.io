@echo off
echo 🚀 Starting Super Mega AI Professional Platform
echo.

echo ✅ Installing required packages...
pip install flask flask-cors flask-jwt-extended requests beautifulsoup4 sqlite3

echo.
echo 🔧 Starting backend server...
start "Super Mega AI Backend" python professional_backend.py

echo.
echo 📱 Opening professional website...
timeout /t 3 /nobreak
start "Super Mega AI Platform" professional_ai_platform.html

echo.
echo ✅ Platform is running!
echo 🌐 Backend API: http://localhost:5000
echo 📄 Frontend: professional_ai_platform.html
echo.
echo Press any key to stop the backend server...
pause
taskkill /F /FI "WINDOWTITLE eq Super Mega AI Backend*"
