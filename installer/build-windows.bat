@echo off
REM Build the K-Ripper Windows installer with Inno Setup.
REM Requires Inno Setup 6 (free): https://jrsoftware.org/isdl.php
REM
REM Output: ../dist/K-Ripper-Windows-Setup.exe

setlocal

set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" (
    echo.
    echo ERROR: Inno Setup 6 not found.
    echo Install from: https://jrsoftware.org/isdl.php
    echo Then re-run this script.
    pause
    exit /b 1
)

cd /d "%~dp0"
"%ISCC%" kripper.iss
if errorlevel 1 (
    pause
    exit /b 1
)

echo.
echo Built: ..\dist\K-Ripper-Windows-Setup.exe
pause
