@echo off
REM LocZ News Engine launcher. Every ~2 HOURS: a 30-minute LOW-PRIORITY generation burst, then EXIT
REM so the ~18GB of model RAM (IndicTrans2 + Ollama qwen) is freed for the ~90 minutes between bursts.
REM The box is a shared workstation (~10:00-21:00 IST). The burst runs at IDLE cpu priority on 6 of 10
REM cores, and Ollama is held to one GPU generation at a time (the RTX 5060 has only 8GB VRAM, so
REM qwen 7B + IndicTrans2 cannot both sit resident), so the machine stays usable DURING the burst.
REM A longer, gentler 30-min window scrapes more unique news than the old 10-min sprint.
REM   MAX_SECONDS=1800      -> engine self-caps generation at 30 min
REM   /LOW /AFFINITY 3F     -> idle cpu priority, 6 of 10 logical cores (4 left for the foreground)
REM   OLLAMA_NUM_PARALLEL=1 -> no concurrent GPU generations; MAX_LOADED_MODELS=1 keeps VRAM for one
REM   PUSH_DELAY=2          -> slow serial writes to the VPS (never a burst -> no swap-thrash hang)
REM   timeout 5400          -> free RAM for 90 min, then repeat (30 + 90 = ~120 min cadence)
set PYTHONUTF8=1
set MAX_SECONDS=1800
set MAX_PER_CYCLE=300
set MAX_PER_FEED=6
set PUSH_DELAY=2
set OLLAMA_NUM_PARALLEL=1
set OLLAMA_MAX_LOADED_MODELS=1
cd /d C:\locz-news
:cycle
echo [%date% %time%] burst start (30 min, idle prio, 6 cores) >> C:\locz-news\engine.log
start "locz-news" /LOW /AFFINITY 3F /WAIT /B C:\it2v\Scripts\python.exe C:\locz-news\engine.py once >> C:\locz-news\engine.log 2>&1
REM free Ollama's model too (unload immediately instead of the 5-min keep-alive)
curl -s -m 5 http://127.0.0.1:11434/api/generate -d "{\"model\":\"qwen2.5:7b-instruct\",\"keep_alive\":0}" > nul 2>&1
echo [%date% %time%] burst done, freeing RAM for 90 min >> C:\locz-news\engine.log
timeout /t 5400 /nobreak > nul
goto cycle
