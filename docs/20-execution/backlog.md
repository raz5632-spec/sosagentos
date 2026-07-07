# Prioritized Backlog

| Rank | ID | Backlog item | Business impact | Est. | Dependencies | Status |
|---|---|---|---|---|---|---|
| 1 | FND-001 | Monorepo, CI, coding standards, CLAUDE package | Foundational | 5d | None | **done** (CI parked — token lacks workflow scope) |
| 2 | DAT-001 | Core Postgres schema for BOM + audit | Foundational | 7d | FND-001 | **done** |
| 3 | IAM-001 | Organizations, users, roles, memberships, tenant guards | Foundational | 6d | DAT-001 | **done** |
| 4 | AGT-001 | ACP contracts + agent registry + invocation logging | Critical differentiator | 8d | DAT-001 | **done** |
| 5 | GOV-001 | Approval engine + audit trail + rollback patterns | Critical differentiator | 6d | IAM-001, AGT-001 | **done** |
| 6 | KNO-001 | File ingestion + knowledge item/version pipeline | Critical differentiator | 8d | AGT-001 | **done** (text capture v1; file upload/STT later) |
| 7 | KNO-002 | pgvector retrieval + graph edge relationships | Critical differentiator | 6d | KNO-001 | **done** (hash embeddings v1 per ADR; semantic provider swap later) |
| 8 | DNA-001 | Organizational DNA Engine + brand rules evaluation | High | 4d | KNO-001 | **done** |
| 9 | EDU-001 | Course / lesson / transcript pipeline | High | 7d | DAT-001 | **done** (text transcripts v1; recording/STT adapters later) |
| 10 | STD-001 | Student timeline + risk profiling + coach actions | High | 8d | EDU-001, KNO-002 | **done** |
| 11 | CNT-001 | Content brief → draft → QA → approval workflow | High | 8d | DNA-001, GOV-001 | **done** |
| 12 | INT-META-001 | Meta app, WhatsApp webhooks, token storage | High | 10d | GOV-001, IAM-001 | **done** (live on prod incl. conversation bot INT-META-002; dedicated business number pending purchase) |
| 13 | INT-GGL-001 | Google OAuth + Drive/Gmail/Calendar connectors | High | 8d | IAM-001 | **done** (OAuth + Gmail import → knowledge; live on prod) |
| 14 | INT-CANVA-001 | Canva integration + design brief/export path | High | 8d | CNT-001 | **done** (OAuth+PKCE connected; live design creation verified 2026-07-06) |
| 15 | ANA-001 | KPI snapshots + CEO dashboard | High | 7d | DAT-001 | **done** (API; frontend workspace later) |
| 16 | SIM-001 | Digital Twin scenario service | Medium-high | 8d | ANA-001, STD-001 | **done** |
| 17 | CMP-001 | Competitor observation pipeline | Medium-high | 6d | KNO-002 | **done** |
| 18 | AUT-001 | Workflow runtime on Temporal + notifications | High | 8d | AGT-001 | **done** (DB-backed runner v1 per ADR-2026-07-03; Temporal re-evaluated at OPS-001) |
| 19 | OPS-001 | Staging/prod, monitoring, backups, runbooks | High | 7d | FND-001 onward | **in_progress** (EC2+compose live; deploy prunes disk before build; backups/monitoring pending) |
| 20 | LCH-001 | Launch hardening, App Review evidence, UAT | Critical before release | 10d | Most above | pending |

| 21 | FRN-001 | CEO console web app (added 2026-07-03 — frontend absent from original backlog) | High | 10d | ANA-001, GOV-001 | **done** (v1: login, KPI dashboard, approvals inbox, agent console) |
