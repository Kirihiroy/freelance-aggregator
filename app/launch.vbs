' Opens the aggregator like a desktop app:
' starts the server in the background (no console window) if it is not running yet,
' then opens http://localhost:3000 in a standalone Edge window (no tabs, no address bar).
Option Explicit
Dim sh, fso, dir, url, i, edge
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
url = "http://localhost:3000"

Function ServerUp()
  Dim req
  On Error Resume Next
  Set req = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  req.setTimeouts 1000, 1000, 1000, 2000
  req.open "GET", url & "/", False
  req.send
  ServerUp = (Err.Number = 0)
  If ServerUp Then ServerUp = (req.status = 200)
  On Error GoTo 0
End Function

If Not ServerUp() Then
  sh.CurrentDirectory = dir
  If Not fso.FolderExists(dir & "\node_modules") Then sh.Run "cmd /c npm install", 0, True
  If Not fso.FolderExists(dir & "\data") Then fso.CreateFolder dir & "\data"
  ' server output goes to data\server.log (useful if something breaks)
  sh.Run "cmd /c node server.js >> data\server.log 2>&1", 0, False
  For i = 1 To 40
    WScript.Sleep 500
    If ServerUp() Then Exit For
  Next
  If Not ServerUp() Then
    MsgBox "The server did not start. See data\server.log in " & dir, vbExclamation, "IT orders"
    WScript.Quit 1
  End If
End If

edge = sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe"
If Not fso.FileExists(edge) Then edge = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Microsoft\Edge\Application\msedge.exe"
If fso.FileExists(edge) Then
  sh.Run """" & edge & """ --app=" & url, 1, False
Else
  sh.Run url
End If
