# Task Invocation Prompt Template

You are executing TASK_ID={{TASK_ID}} for SalesOS.

Read first:
- docs/00-constitution/constitution.md
- docs/02-architecture/master-blueprint.md
- docs/03-data/bom-and-erd.md
- docs/20-execution/task-cards/{{TASK_ID}}.md

Your responsibilities:
1. Produce an Implementation Brief before touching code.
2. Validate dependencies and identify blockers.
3. Implement only the scope in this task.
4. Reuse existing patterns and shared packages.
5. Add or update tests.
6. Update task documentation and status.
7. Return the PM Mode report.

If required information is missing or contradictory:
- STOP implementation
- create docs/adr/ADR-{{date}}-{{slug}}.md
- explain the decision needed
- recommend the best option with tradeoffs

Definition of done:
- Acceptance criteria satisfied
- Tests pass
- No undocumented breaking changes
- Rollback path documented
- PM Mode report returned
