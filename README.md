# SalesOS

A multi-agent AI Operating System for S.O.S. — a digital operating company centralizing
knowledge, decisions, student operations, content production, research, competitor
intelligence, analytics, automation, and communications.

**Start here:** [CLAUDE.md](CLAUDE.md) → [docs/00-constitution/constitution.md](docs/00-constitution/constitution.md)
→ [docs/20-execution/current-sprint.md](docs/20-execution/current-sprint.md)

## Local development

```bash
pnpm install
docker compose up -d        # Postgres (pgvector) + Redis
pnpm turbo lint typecheck test
```

## Repository map

- `apps/` — web (Next.js), api (NestJS), worker (Temporal workers)
- `packages/` — contracts, db, ui, config, observability, ai
- `docs/` — Product Bible: constitution, architecture, data model, governance, integrations, roadmap, execution book
- `prompts/` — task prompt + PM Mode templates
- `.claude/agents/` — review subagents
