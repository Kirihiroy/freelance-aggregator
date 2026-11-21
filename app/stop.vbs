' Stops the background aggregator server (the process listening on port 3000).
Option Explicit
Dim sh
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell -NoProfile -WindowStyle Hidden -Command ""Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }""", 0, True
MsgBox "The aggregator server is stopped.", vbInformation, "IT orders"
