@echo off
REM LocZ News Engine launcher — started automatically at logon by Task Scheduler.
REM Runs the hourly pull -> regenerate -> translate -> integrity-gate -> post-to-VPS loop.
set PYTHONUTF8=1
REM HF_TOKEN is read from the user environment (set once via setx); required for IndicTrans2.
cd /d C:\locz-news
echo [%date% %time%] LocZ News Engine starting >> C:\locz-news\engine.log
C:\it2v\Scripts\python.exe C:\locz-news\engine.py loop >> C:\locz-news\engine.log 2>&1
