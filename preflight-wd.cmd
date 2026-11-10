@echo off
rem Model check + flash backup on WD firmware (before flashing), for Windows.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\preflight-wd.ps1" %*
