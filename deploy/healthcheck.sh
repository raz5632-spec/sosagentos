#!/bin/bash
# Every-5-min health monitor for SalesOS. If the API health endpoint fails
# twice in a row, restart the app containers and log it. Lightweight, no deps.
set -uo pipefail

LOG=/opt/salesos/backups/health.log
STATE=/tmp/salesos-health-fails
mkdir -p /opt/salesos/backups

if curl -fsS --max-time 15 http://localhost:3011/healthz >/dev/null 2>&1; then
  echo 0 > "$STATE"
  exit 0
fi

FAILS=$(( $(cat "$STATE" 2>/dev/null || echo 0) + 1 ))
echo "$FAILS" > "$STATE"
echo "$(date -Is) health check failed (streak=$FAILS)" >> "$LOG"

if [ "$FAILS" -ge 2 ]; then
  echo "$(date -Is) restarting app containers" >> "$LOG"
  cd /opt/salesos/app && sudo docker compose --env-file /opt/salesos/.env \
    -f deploy/docker-compose.prod.yml restart api web >> "$LOG" 2>&1 || true
  echo 0 > "$STATE"
fi
