@echo off
REM LocZ News Engine launcher. Each hour: a ~10-minute generation BURST, then EXIT so the ~18GB of
REM model RAM (IndicTrans2 + Ollama qwen) is freed for the remaining ~50 minutes. The box is a shared
REM workstation powered on ~10:00-21:00 IST; this keeps it usable between bursts.
REM   MAX_SECONDS=600  -> engine self-caps generation at 10 min
REM   PUSH_DELAY=2     -> slow serial writes to the VPS (never a burst -> no swap-thrash hang)
REM   timeout 3000     -> free RAM for 50 min, then repeat (10 + 50 = ~60 min cadence)
set PYTHONUTF8=1
set MAX_SECONDS=600
set PUSH_DELAY=2
cd /d C:\locz-news
:cycle
echo [%date% %time%] burst start >> C:\locz-news\engine.log
C:\it2v\Scripts\python.exe C:\locz-news\engine.py once >> C:\locz-news\engine.log 2>&1
REM free Ollama's model too (unload immediately instead of the 5-min keep-alive)
curl -s -m 5 http://127.0.0.1:11434/api/generate -d "{\"model\":\"qwen2.5:7b-instruct\",\"keep_alive\":0}" > nul 2>&1
echo [%date% %time%] burst done, freeing RAM for 50 min >> C:\locz-news\engine.log
timeout /t 3000 /nobreak > nul
goto cycle
