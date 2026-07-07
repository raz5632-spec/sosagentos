# Backups & Monitoring (OPS-001)

Live on the staging/prod EC2 host (`63.184.103.26`, eu-central-1).

## Nightly database backup
- Script: `deploy/backup.sh` on the host at `/opt/salesos/app/deploy/backup.sh`.
- Cron: `15 2 * * *` (02:15 host time daily).
- Output: gzip'd `pg_dump` to `/opt/salesos/backups/salesos-<stamp>.sql.gz`.
- Retention: newest 14 kept; older pruned. Log: `/opt/salesos/backups/backup.log`.

### Restore procedure
```bash
# copy a dump down, or restore in place on the host:
gunzip -c /opt/salesos/backups/salesos-YYYYMMDD-HHMMSS.sql.gz \
  | sudo docker exec -i deploy-postgres-1 psql -U salesos salesos
```

## Health monitor
- Script: `deploy/healthcheck.sh` on the host.
- Cron: `*/5 * * * *` — hits `http://localhost:3011/healthz`.
- On 2 consecutive failures: restarts `api` + `web` containers and logs to
  `/opt/salesos/backups/health.log`.

## Off-host copies (future, at GA)
Sync `/opt/salesos/backups` to S3 with lifecycle rules once the AWS account is
hardened. Until then backups live on the instance's 30 GB gp3 volume.
