' Runs Jarvis with no visible console window - this is the one to pin to your taskbar.
' Double-clicking a .bat file always shows a console window; this .vbs wrapper avoids
' that entirely by launching the same command with its window hidden (style 0).
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = scriptDir
WshShell.Run "cmd /c npm start", 0, False
