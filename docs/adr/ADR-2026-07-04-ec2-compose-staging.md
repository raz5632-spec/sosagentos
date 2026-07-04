# ADR: Single EC2 + docker-compose for first cloud deploy; ECS/RDS deferred to GA

**Date:** 2026-07-04 · **Status:** accepted · **Task:** OPS-001

## Context
The blueprint's production baseline is ECS/Fargate + RDS. Current reality: single tenant,
one operator, no traffic yet, cost sensitivity, and the immediate goal is a public HTTPS
endpoint (Meta webhooks + console access from anywhere).

## Decision
Stage 1 deploy: one EC2 instance (t3.small, eu-central-1) running docker-compose:
postgres(pgvector) + api + web + Caddy (automatic HTTPS). DNS stays at GoDaddy with
A records `app`/`api`.secretofsaleschat.org → Elastic IP. Secrets live in /opt/salesos/.env
on the instance (never in the repo).

## Consequences
- Single point of failure and manual backups (acceptable pre-GA; nightly pg_dump cron added).
- Migration path to ECS/RDS at GA is contained: same containers, swap compose for task
  definitions and DATABASE_URL for RDS.
