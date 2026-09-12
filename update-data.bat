@echo off
rem Refreshes the offline copy of the sheet (assets\data\sheet.csv).
rem The site uses that copy when the Google Sheet cannot be loaded.
chcp 65001 >nul
cd /d "%~dp0"
set SHEET=1nLEEhJkWVQu3oMntNVr1hYLYvCDsXhqsOMU-S9Au9KM
set GID=0
powershell -NoProfile -Command "Invoke-WebRequest -UseBasicParsing -Uri 'https://docs.google.com/spreadsheets/d/%SHEET%/export?format=csv&gid=%GID%' -OutFile 'assets\data\sheet.csv'"
if errorlevel 1 (
  echo Download failed - check the network and that the sheet is shared by link.
) else (
  echo Updated: assets\data\sheet.csv
)
pause
