@echo off
rem Local preview: serves this folder so the page can read the Google Sheet.
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   http://localhost:8000/
echo   Ctrl+C - stop
echo.
start "" http://localhost:8000/
python -m http.server 8000
if errorlevel 1 (
  echo Python not found. Install it or open the published GitHub Pages address.
  pause
)
