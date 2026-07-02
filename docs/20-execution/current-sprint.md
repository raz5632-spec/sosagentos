# Current Sprint: Alpha → Bravo

**Alpha (done):** Monorepo live; CI green; base schema migrated.
**Bravo focus:** Identity, tenancy, agent runtime, ACP
**Bravo exit criteria:** User/org model works; agents invoke via typed contracts

## Sprint scope

| Task | Status | Notes |
|---|---|---|
| FND-001 Monorepo, CI, coding standards, CLAUDE package | done | 2026-07-02. Pushed to github.com/raz5632-spec/sosagentos. CI workflow parked at docs/30-ops/ci-workflow-pending.yml until the GitHub token gets `workflow` scope |
| DAT-001 Core Postgres schema for BOM + audit | done | 2026-07-02. Prisma schema (40+ tables), pgvector + HNSW index, audit ledger, seed (org sos, 4 roles, 27 agents, admin). Local ports: Postgres 5433, Redis 6380. Rollback: `prisma migrate reset` (dev) |
| IAM-001 Organizations, users, roles, memberships, tenant guards | done | 2026-07-02. NestJS apps/api: JWT login (local auth per ADR-2026-07-02), /auth/me, org member list/add with audit, JwtAuthGuard + TenantGuard + RolesGuard, trace-id middleware + pino logs. 10 e2e tests green. Admin login: raz5632@gmail.com / SEED_ADMIN_PASSWORD (default sos-dev-2026). CI runs against pgvector Postgres service |
| AGT-001 ACP contracts + agent registry + invocation logging | done | 2026-07-02. packages/contracts: zod ACP schema + confidence policy. packages/ai: provider adapter (Anthropic Messages API), ModelRouter (opus-4-8 default, haiku lightweight, failover), AgentRuntime (L2+ approval gate, L4 recommend-only, model_invocations + cost ledger + audit). API: GET/POST /orgs/:orgId/agents(+/:code/invoke, /invocations), owner/manager only. Fake provider in keyless envs (CI). Live smoke verified against Anthropic (scripts/smoke.mts) — first real invocation logged at $0.000259 |
| GOV-001 Approval engine + audit trail + rollback patterns | next | Approval inbox API over the existing approvals table; wire AgentRuntime awaiting_approval → Approval records |

## Blockers / external actions (owner: CEO)
- ~~GitHub token workflow scope~~ resolved 2026-07-02: new token installed, CI restored to .github/workflows/ci.yml
- Anthropic API key received 2026-07-02 (stored in local .env only) — **recommend rotating it**, since it was shared in chat
- Still open: cloud account, domain, OpenAI/Gemini keys — see external-actions.md
