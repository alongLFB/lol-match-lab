@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 打包 LoL 对局实验室
python build.py
pause
