#!/usr/bin/env bash
# Read-only VPS health check. Changes nothing on the server.
# Run on the VPS:  bash scripts/vps-health-check.sh
#
# Reports load and CPU steal (the host-throttle signal), the top CPU processes, Postgres
# queries running longer than a minute, and tables with heavy sequential scans. Built after
# the 3 Oct 2026 throttle, where steal reached 95% and the cause was unindexed full-table scans.
set -uo pipefail

echo "== load & steal (st > 20% means the host is throttling) =="
uptime
top -bn1 | sed -n 3p

echo "== top CPU processes =="
ps -eo pid,user,pcpu,etime,args --sort=-pcpu | head -8

PG=$(docker ps --format '{{.Names}}' | grep -i postgres | head -1)
if [ -n "$PG" ]; then
  echo "== queries running over 1 minute =="
  docker exec -i "$PG" psql -U locz -d locz -At -F' | ' -c \
    "SELECT datname, now()-query_start AS dur, left(regexp_replace(query,'\s+',' ','g'),120)
       FROM pg_stat_activity
      WHERE state='active' AND now()-query_start > interval '1 minute' AND pid <> pg_backend_pid();"

  echo "== heavy sequential scans (seq_tup_read, since last pg_stat_reset) =="
  docker exec -i "$PG" psql -U locz -d locz -At -F' | ' -c \
    "SELECT relname, seq_scan, seq_tup_read, n_live_tup
       FROM pg_stat_user_tables ORDER BY seq_tup_read DESC LIMIT 8;"
fi
