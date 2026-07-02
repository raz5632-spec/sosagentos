# Current Sprint: Alpha

**Focus:** Repo, infra baseline, CLAUDE package, data core
**Exit criteria:** Monorepo live; CI green; base schema migrated

## Sprint scope

| Task | Status | Notes |
|---|---|---|
| FND-001 Monorepo, CI, coding standards, CLAUDE package | done | 2026-07-02. Pushed to github.com/raz5632-spec/sosagentos. CI workflow parked at docs/30-ops/ci-workflow-pending.yml until the GitHub token gets `workflow` scope |
| DAT-001 Core Postgres schema for BOM + audit | done | 2026-07-02. Prisma schema (40+ tables), pgvector + HNSW index, audit ledger, seed (org sos, 4 roles, 27 agents, admin). Local ports: Postgres 5433, Redis 6380. Rollback: `prisma migrate reset` (dev) |
| IAM-001 Organizations, users, roles, memberships, tenant guards | next | NestJS api app + auth + tenant guards |

## Blockers / external actions (owner: CEO)
- ~~GitHub token workflow scope~~ resolved 2026-07-02: new token installed, CI restored to .github/workflows/ci.yml
- Anthropic API key received 2026-07-02 (stored in local .env only) — **recommend rotating it**, since it was shared in chat
- Still open: cloud account, domain, OpenAI/Gemini keys — see external-actions.md
