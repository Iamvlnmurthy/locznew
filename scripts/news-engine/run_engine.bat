@echo off
REM LocZ News Engine launcher. Runs ONE cycle then EXITS so the ~18GB of model RAM
REM (IndicTrans2 + Ollama qwen) is freed between cycles instead of held 24/7 — the box is
REM a shared workstation. A cycle takes a few minutes; then it sleeps ~55 min and repeats.
set PYTHONUTF8=1
cd /d C:\locz-news
:cycle
echo [%date% %time%] cycle start >> C:\locz-news\engine.log
C:\it2v\Scripts\python.exe C:\locz-news\engine.py once >> C:\locz-news\engine.log 2>&1
REM free Ollama's model too (unload immediately instead of the 5-min keep-alive)
curl -s -m 5 http://127.0.0.1:11434/api/generate -d "{\"model\":\"qwen2.5:7b-instruct\",\"keep_alive\":0}" > nul 2>&1
echo [%date% %time%] cycle done, sleeping >> C:\locz-news\engine.log
timeout /t 3300 /nobreak > nul
goto cycle
