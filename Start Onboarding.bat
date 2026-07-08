@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to start onboarding.
  echo Install the Node.js LTS version, then run this file again.
  echo Download it from https://nodejs.org
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required to start onboarding.
  echo Install the Node.js LTS version, which includes npm, then run this file again.
  echo Download it from https://nodejs.org
  exit /b 1
)

npm start
