# Master Blueprint

## Structural view

```
Owner/CEO
  └─ CEO Interface Agent
       └─ Supreme Orchestrator
            ├─ Project Manager Agent · Model Router · Approval Agent · Quality Review · Security & Compliance
            ├─ Departments: Knowledge · Student · Content · Research · Competitor Intel · Analytics/Digital Twin · Integration · Automation
            ├─ Shared services: Company Memory + Knowledge Graph · Organizational DNA Engine
            ├─ Infrastructure: ACP Bus · Durable Workflow Engine (Temporal) · Audit/Logs/Traces
            └─ External: Meta (WhatsApp/Instagram) · Google APIs · Canva Connect · OpenAI · Anthropic · Gemini
```

## Recommended tech stack

| Layer | Recommendation | Rationale |
|---|---|---|
| Monorepo | pnpm + Turborepo | Native workspaces; scaled multi-package task execution |
| Frontend | Next.js + React + TypeScript | Full-stack ergonomics, dashboarding |
| Backend API | NestJS + TypeScript | Explicit module boundaries, DTOs, guards, testability |
| Background orchestration | Temporal | Durable execution, retries, long-running approvals/integration jobs |
| Database | PostgreSQL | Relational model, jsonb, row-level security |
| Vector retrieval | pgvector on PostgreSQL | RAG inside the relational core; HNSW indexing |
| Object storage | S3-compatible | Recordings, exports, raw uploads |
| Cache / ephemeral queueing | Redis | Rate limits, dedupe windows, short-lived coordination |
| Auth | OIDC/SAML IdP (Keycloak self-hosted default; managed acceptable) | Multi-tenant SaaS readiness |
| Search / graph | Postgres + pgvector + edge tables (graph service only if proven necessary) | Keeps v1 simple |
| Observability | OpenTelemetry + Collector + Grafana/Prometheus/Loki + Sentry | Vendor-neutral telemetry |
| CI/CD | GitHub Actions + Docker + IaC | Claude Code compatibility |
| Infra | AWS: ECS/Fargate (EKS later if needed); RDS Postgres | Production baseline without day-one Kubernetes |
| Secrets | Cloud secret manager + runtime injection | No .env secrets in repo or CI logs |
| LLM provider layer | Provider adapters for Anthropic, OpenAI, Gemini | Vendor choice + fallback |
| STT / OCR | Pluggable adapters | Avoid lock-in |

## Repository structure

```
salesos/
├─ CLAUDE.md
├─ README.md
├─ apps/ (web, api, worker)
├─ packages/ (contracts, db, ui, config, observability, ai)
├─ .claude/ (agents/, settings.json, hooks/)
├─ docs/ (00-constitution … 30-ops, adr/)
├─ prompts/
└─ exports/
```
