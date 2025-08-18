@echo off
echo Starting 24/7 Autonomous Development Team...

:start
call %~dp0.venv\Scripts\activate.bat
python autonomous_team_tasks.py

rem If the process exits, wait 5 seconds and restart
echo Team process exited. Restarting in 5 seconds...
timeout /t 5 /nobreak
goto start
