@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Chua co Node.js. Cai Node.js LTS tu https://nodejs.org roi chay lai file nay.
  pause
  exit /b 1
)
if not exist config.json (
  echo Thieu config.json. Chep file config.json tu may admin vao thu muc nay roi chay lai.
  pause
  exit /b 1
)
echo Dang tao lo tat tu chay khi mo may (thu muc Startup)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=(New-Object -ComObject WScript.Shell).SpecialFolders('Startup'); foreach($n in 'chay-quet','chay-dang-ky'){ $s=(New-Object -ComObject WScript.Shell).CreateShortcut(\"$d\$n.lnk\"); $s.TargetPath=\"$PWD\$n.bat\"; $s.WorkingDirectory=\"$PWD\"; $s.WindowStyle=7; $s.Save() }; 'Da tao 2 lo tat o: ' + $d"
echo.
echo Xong. Tu lan mo may sau, cau noi tu chay. Bay gio chay thu:
start "" "%~dp0chay-quet.bat"
start "" "%~dp0chay-dang-ky.bat"
timeout /t 5 >nul
node mo-trang.js
echo Neu trinh duyet hien trang DemoGym la thanh cong. Dung Chrome hoac Edge, mo bang ten mien (HTTPS), khong dung dia chi IP.
pause
