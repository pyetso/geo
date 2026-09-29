@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title GeoHub Radio

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js 20 or newer is required.
  echo Install it from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

set "PORT=8787"
for /L %%P in (8787,1,8800) do (
  netstat -ano -p tcp 2>nul | findstr /R /C:":%%P .*LISTENING" >nul
  if errorlevel 1 (
    set "PORT=%%P"
    goto :port_found
  )
)

echo.
echo Could not find a free port between 8787 and 8800.
echo Close an old local server and try again.
echo.
pause
exit /b 1

:port_found
echo.
echo GeoHub Radio
 echo ------------
echo Opening http://localhost:%PORT%
echo Press Ctrl+C to stop.
echo.
node local\server.js --open

if errorlevel 1 (
  echo.
  echo GeoHub stopped with an error.
  pause
)
