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
echo Dang xoa lo tat cu va tao lo tat tu chay AN khi mo may (thu muc Startup)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=(New-Object -ComObject WScript.Shell).SpecialFolders('Startup'); foreach($n in 'chay-quet','chay-dang-ky'){ Remove-Item \"$d\$n.lnk\" -ErrorAction SilentlyContinue }; $s=(New-Object -ComObject WScript.Shell).CreateShortcut(\"$d\cau-noi-cham-cong.lnk\"); $s.TargetPath=\"$PWD\chay-an.vbs\"; $s.WorkingDirectory=\"$PWD\"; $s.Save(); 'Da tao lo tat o: ' + $d"
echo.
echo Dang tat cau noi cu (neu dang chay) roi bat lai che do an...
call "%~dp0dung-cau-noi.bat" /q >nul 2>nul
wscript "%~dp0chay-an.vbs"
timeout /t 5 >nul
node mo-trang.js
echo.
echo Xong. Cau noi chay AN, khong co cua so cmd nao can mo. Tu chay khi mo may.
echo Tat cau noi: bam doi dung-cau-noi.bat. Muon xem cua so: chay chay-quet.bat.
echo Luu y: may le tan khong duoc de ngu (Sleep) vi se mat ket noi.
pause
