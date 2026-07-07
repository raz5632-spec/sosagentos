#!/bin/bash
# Nightly PostgreSQL backup for SalesOS. Runs on the EC2 host via cron.
# Keeps 14 daily dumps; older ones are pruned. Logs to /opt/salesos/backups/backup.log
set -euo pipefail

BACKUP_DIR=/opt/salesos/backups
STAMP=$(date +%Y%m%d-%H%M%S)
FILE="$BACKUP_DIR/salesos-$STAMP.sql.gz"
mkdir -p "$BACKUP_DIR"

# Dump from the running postgres container, gzip on the fly.
if sudo docker exec deploy-postgres-1 pg_dump -U salesos salesos | gzip > "$FILE"; then
  SIZE=$(du -h "$FILE" | cut -f1)
  echo "$(date -Is) OK  $FILE ($SIZE)" >> "$BACKUP_DIR/backup.log"
else
  echo "$(date -Is) FAIL dump failed" >> "$BACKUP_DIR/backup.log"
  exit 1
fi

# Retain the newest 14 backups.
ls -1t "$BACKUP_DIR"/salesos-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
