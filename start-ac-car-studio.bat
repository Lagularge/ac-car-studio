@echo off
cd /d "%~dp0"
if not exist "dist\index.html" (
  call npm run build
)
if not exist "dist-electron\main.js" (
  call npm run build:electron
)
npx electron .
