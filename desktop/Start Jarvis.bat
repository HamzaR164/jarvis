@echo off
REM Finds this folder automatically no matter where it's extracted to.
cd /d "%~dp0"
start "" npm start
