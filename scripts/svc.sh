#!/usr/bin/env bash
# On-demand toggler for rarely-used Docker stacks on the shared VPS, so they don't sit in RAM 24/7.
# Install at /usr/local/bin/svc (root). Usage:
#   svc start dograh     # bring dograh up when you need it
#   svc stop  dograh     # shut it down when done (frees ~280MB)
#   svc start n8n
#   svc stop  n8n
#   svc start all | svc stop all
#   svc status           # what's up right now
#
# `stop` also pins restart=no so a reboot won't silently bring the stack back; `start` sets
# restart=unless-stopped so it survives a crash *while you're using it*.
set -uo pipefail

N8N="n8n"
# postgres/redis first so the api has its deps; cloudflared last (the tunnel that exposes dograh.onrol.in)
DOGRAH="dograh-dograh-postgres-1 dograh-dograh-redis-1 dograh-dograh-minio-1 dograh-dograh-api-1 dograh-dograh-ui-1 dograh-cloudflared-1"

names_for() {
  case "$1" in
    n8n) echo "$N8N" ;;
    dograh) echo "$DOGRAH" ;;
    all) echo "$N8N $DOGRAH" ;;
    *) echo "" ;;
  esac
}

action="${1:-}"; target="${2:-}"
case "$action" in
  start)
    set -- $(names_for "$target"); [ -z "${1:-}" ] && { echo "usage: svc start <n8n|dograh|all>"; exit 1; }
    for c in "$@"; do docker start "$c" >/dev/null 2>&1 && docker update --restart=unless-stopped "$c" >/dev/null 2>&1 && echo "started $c"; done
    ;;
  stop)
    set -- $(names_for "$target"); [ -z "${1:-}" ] && { echo "usage: svc stop <n8n|dograh|all>"; exit 1; }
    for c in "$@"; do docker update --restart=no "$c" >/dev/null 2>&1; docker stop "$c" >/dev/null 2>&1 && echo "stopped $c"; done
    ;;
  status)
    echo "n8n + dograh containers:"
    docker ps -a --format '{{.Names}} | {{.State}} | {{.Status}}' 2>/dev/null | grep -iE 'n8n|dograh' | sort
    ;;
  *)
    echo "usage: svc <start|stop|status> <n8n|dograh|all>"; exit 1 ;;
esac
