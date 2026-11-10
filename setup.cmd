@echo off
rem EX2 Ultra Reborn installer for Windows: works from Command Prompt and PowerShell.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\setup.ps1" %*
