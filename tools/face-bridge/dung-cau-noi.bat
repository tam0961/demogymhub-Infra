@echo off
echo Dang tat cau noi may cham cong...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*bridge.js*') -or ($_.Name -eq 'cmd.exe' -and ($_.CommandLine -like '*chay-quet.bat*' -or $_.CommandLine -like '*chay-dang-ky.bat*' -or $_.CommandLine -like '*chay-cau-noi.bat*')) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo Da tat. Muon chay lai: bam doi chay-an.vbs
if /i not "%~1"=="/q" pause
