@echo off
chcp 65001 >nul
cd /d "%~dp0"
title LoL Match Lab
node server\index.js --open
pause
