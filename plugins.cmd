@echo off
rem EX2 Ultra Reborn optional plugins for Windows: works from Command Prompt and PowerShell.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\setup.ps1" plugins %*
