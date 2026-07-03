# ADR: DB-backed workflow runner v1; Temporal deferred to OPS phase

**Date:** 2026-07-03 · **Status:** accepted · **Task:** AUT-001

## Context
The blueprint mandates Temporal for durable execution. There is no cloud account yet
(OPS-001 blocked on CEO external actions), so a local Temporal cluster would be
throwaway infrastructure ahead of any deploy target.

## Decision
v1 runs workflow definitions (ordered agent steps) in-process over the existing BOM
tables: `workflows` / `workflow_versions` / `workflow_runs` / `task_runs`. Each step is a
task_run with attempts (retry once on failure), L2+ steps park in the approvals inbox and
mark the run `blocked`. The runner is behind a `WorkflowsService.run()` seam — the Temporal
migration (OPS phase) replaces the executor, not the API or the tables.

## Consequences
- No durability across process crashes mid-run (acceptable: runs are short, single-tenant dev).
- Retries are simple (1 retry, no backoff queue); provider-level retries already exist in the SDK.
- Temporal adoption is re-evaluated in OPS-001 when the deploy target exists.
