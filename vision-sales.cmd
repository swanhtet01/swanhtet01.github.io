@echo off
setlocal
if not defined SUPERMEGA_VISION_SALES_ROOT set "SUPERMEGA_VISION_SALES_ROOT=%LOCALAPPDATA%\SuperMega\vision-sales"
if not exist "%SUPERMEGA_VISION_SALES_ROOT%\inbox" mkdir "%SUPERMEGA_VISION_SALES_ROOT%\inbox"
if not exist "%SUPERMEGA_VISION_SALES_ROOT%\outbox" mkdir "%SUPERMEGA_VISION_SALES_ROOT%\outbox"
node "%~dp0tools\process_vision_lead_inbox.mjs" --inbox "%SUPERMEGA_VISION_SALES_ROOT%\inbox" --outbox "%SUPERMEGA_VISION_SALES_ROOT%\outbox"
exit /b %ERRORLEVEL%
