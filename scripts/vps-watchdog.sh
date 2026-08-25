#!/usr/bin/env bash
# LocZ VPS watchdog. Runs from cron (every 2 min) as the `locz` user. Detects the exact failure
# modes behind the outages — swap-thrash / OOM memory pressure and a crash-looping locz-api — then
# logs a heartbeat, auto-recovers a looping api ONCE, and (optionally) alerts. Detection is read-only;
# the only mutating action is a single conservative `pm2 restart` to break an api crash-loop.
#
# Alerts: set an email and/or webhook in the crontab line, e.g.
#   LOCZ_ALERT_EMAIL=you@example.com  LOCZ_ALERT_WEBHOOK=https://hooks.slack.com/...  (Slack/Discord/Telegram-compatible {"text":...})
# With neither set it still logs + auto-recovers; you just don't get pushed.
set -uo pipefail
LOG=/home/locz/watchdog.log
STATE=/home/locz/.watchdog-state
ALERT_EMAIL="${LOCZ_ALERT_EMAIL:-}"
ALERT_WEBHOOK="${LOCZ_ALERT_WEBHOOK:-}"
MEM_PCT_ALERT=92        # % used
LOAD_ALERT=8            # 1-min load
RESTART_JUMP=6          # api restarts gained since last run = crash-loop
touch "$LOG" "$STATE" 2>/dev/null || true

ts() { date '+%F %T'; }
log() { echo "[$(ts)] $*" >> "$LOG"; }

alert() {
  local msg="$1"
  log "ALERT: $msg"
  [ -n "$ALERT_WEBHOOK" ] && curl -s -m 8 -H 'Content-Type: application/json' \
    -d "{\"text\":\"[LocZ $(hostname)] $msg\"}" "$ALERT_WEBHOOK" >/dev/null 2>&1 || true
  [ -n "$ALERT_EMAIL" ] && command -v mail >/dev/null 2>&1 && \
    echo "$msg" | mail -s "[LocZ alert] $(hostname)" "$ALERT_EMAIL" 2>/dev/null || true
}

# Re-alert on the same key at most once per 30 min so a sustained problem doesn't spam.
should_alert() {
  local key="$1" now last
  now=$(date +%s)
  last=$(grep "^alert:$key:" "$STATE" 2>/dev/null | tail -1 | cut -d: -f3)
  if [ -z "$last" ] || [ $((now - last)) -ge 1800 ]; then
    sed -i "/^alert:$key:/d" "$STATE" 2>/dev/null || true
    echo "alert:$key:$now" >> "$STATE"
    return 0
  fi
  return 1
}

# ---- memory / load ----
total=$(awk '/^MemTotal:/{print $2}' /proc/meminfo)
avail=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)
used_pct=$(( (total - avail) * 100 / total ))
swap_mb=$(awk '/^SwapTotal:/{t=$2}/^SwapFree:/{f=$2}END{printf "%d", (t-f)/1024}' /proc/meminfo)
load1=$(cut -d' ' -f1 /proc/loadavg)
log "heartbeat mem_used=${used_pct}% swap=${swap_mb}MB load=${load1}"

[ "$used_pct" -ge "$MEM_PCT_ALERT" ] && should_alert mem && \
  alert "High memory: ${used_pct}% used, swap ${swap_mb}MB, load ${load1} — OOM risk (the deploy-build cascade signature)"
awk "BEGIN{exit !($load1 > $LOAD_ALERT)}" && should_alert load && \
  alert "High load: ${load1} — swap-thrash likely"

# ---- api health / crash-loop ----
read -r status restarts < <(pm2 jlist 2>/dev/null | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin); a=[p for p in d if p['name']=='locz-api']
  print(a[0]['pm2_env']['status'], a[0]['pm2_env'].get('restart_time',0)) if a else print('missing 0')
except Exception:
  print('unknown 0')
" 2>/dev/null)
status="${status:-unknown}"; restarts="${restarts:-0}"
prev=$(grep '^api_restarts:' "$STATE" 2>/dev/null | tail -1 | cut -d: -f2)
prev="${prev:-$restarts}"
sed -i '/^api_restarts:/d' "$STATE" 2>/dev/null || true
echo "api_restarts:$restarts" >> "$STATE"
delta=$(( restarts - prev ))

if [ "$status" != "online" ]; then
  should_alert api_down && alert "locz-api is '${status}' (not online)"
elif [ "$delta" -ge "$RESTART_JUMP" ]; then
  log "api crash-loop: +${delta} restarts since last check"
  should_alert api_loop && alert "locz-api crash-looping (+${delta} restarts/2min). Auto-recovering once. If it persists it's usually the argon2 native core-dump — run: npm rebuild argon2 --build-from-source"
  # Break the loop the way manual recovery does: stop, let load settle, start clean. Once per run.
  ( pm2 stop locz-api >/dev/null 2>&1; sleep 20; pm2 start locz-api --update-env >/dev/null 2>&1 ) && \
    log "auto-recovery: locz-api stop→start issued"
fi
