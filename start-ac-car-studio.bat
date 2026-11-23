@echo off
cd /d "%~dp0"
for %%F in ("release\AC-Car-Studio-*-win-portable.exe") do (
  start "" "%%~fF"
  exit /b 0
)
call npm run build
for %%F in ("release\AC-Car-Studio-*-win-portable.exe") do (
  start "" "%%~fF"
  exit /b 0
)
