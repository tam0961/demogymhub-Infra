' Chay cau noi AN (khong hien cua so). Tu khoi dong lai neu cau noi dung. Dung dung-cau-noi.bat de tat.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
sh.Run "cmd /c """ & dir & "\chay-quet.bat""", 0, False
sh.Run "cmd /c """ & dir & "\chay-dang-ky.bat""", 0, False
