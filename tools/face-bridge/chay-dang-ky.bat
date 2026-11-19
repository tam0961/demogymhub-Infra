@echo off
cd /d "%~dp0"
:loop
node bridge.js jobs
echo Cau noi da dung, tu khoi dong lai sau 5 giay. Dong cua so nay de tat han.
timeout /t 5 >nul
goto loop
