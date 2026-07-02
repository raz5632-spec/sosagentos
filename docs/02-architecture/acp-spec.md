# Agent Communication Protocol (ACP) Specification

The ACP is the difference between "many prompts" and a system. Strict internal contract.

## Canonical message schema

```json
{
  "message_id": "uuid",
  "workflow_id": "uuid",
  "task_id": "TASK-KG-004",
  "parent_task_id": "TASK-KG-001",
  "correlation_id": "uuid",
  "causation_id": "uuid",
  "tenant_id": "org_sos",
  "source_agent": "supreme_orchestrator",
  "target_agent": "knowledge_curator",
  "requested_by": "ceo_interface|system|workflow",
  "priority": "critical|high|medium|low|background",
  "approval_level": "L0|L1|L2|L3|L4",
  "required_confidence": 0.9,
  "objective": "Promote validated lesson insight into production knowledge",
  "constraints": {
    "deadline": "ISO-8601",
    "budget_tokens": 12000,
    "max_retries": 2,
    "must_cite_sources": true,
    "provider_restrictions": ["official_api_only"]
  },
  "context_refs": ["kg:item:abc123", "lesson:42", "student:998"],
  "inputs": { "payload_ref": "s3://...", "inline_summary": "..." },
  "status": "created|queued|in_progress|blocked|awaiting_review|awaiting_approval|completed|failed|rolled_back",
  "output": null,
  "evidence": [],
  "explainability": {
    "why_this_agent": "",
    "why_this_model": "",
    "important_assumptions": []
  },
  "audit": {
    "created_at": "", "started_at": "", "completed_at": "",
    "cost_estimate_usd": 0.0,
    "provider": "anthropic", "model": "claude-sonnet",
    "token_usage": { "input": 0, "output": 0, "cached_input": 0 }
  },
  "error": null,
  "next_action": null
}
```

## Task lifecycle

```
created → triaged → planned → queued → in_progress → self_validated → qa_review
→ awaiting_approval → completed
```

Alternate branches:
- `in_progress → blocked → escalated`
- `in_progress → failed → retried → in_progress`
- `completed → rolled_back` (compensating action)

## Priority model

| Priority | Use case | SLA target |
|---|---|---|
| Critical | Webhook/auth failures, production outages, blocked time-sensitive approvals | Minutes |
| High | Student-risk alerts, expiring tokens, launch blockers, broken publish path | Same day |
| Medium | Feature implementation, knowledge curation, content generation | 1–3 days |
| Low | Back-office cleanup, refactors, low-risk enrichment | This sprint |
| Background | AI intelligence scans, model evaluations, passive competitor monitoring | Opportunistic |

## Confidence policy (hard-coded in orchestration)

| Band | Meaning | Allowed behavior |
|---|---|---|
| 0.90–1.00 | Strong support, sufficient evidence | Execute if approval level allows |
| 0.75–0.89 | Plausible but not decisive | Route through QA or ask for confirmation |
| 0.60–0.74 | Weak or incomplete | Do not execute; ask for more data or research |
| < 0.60 | Unsafe / speculative | Return insufficiency and escalate |

## Explainability — always five fields
1. Why this action was proposed
2. Which sources and internal records were used
3. Which rules or DNA policies affected the result
4. Which alternatives were considered or rejected
5. Whether a human approval gate was applied

## Error recovery

| Failure type | Example | Response |
|---|---|---|
| Transient infrastructure | 429, 502, timeout, DB lock | Retry with exponential backoff + jitter; obey retry-after |
| Deterministic validation | Failing acceptance test, schema mismatch | Do not blind-retry; revise implementation or escalate |
| Policy failure | Missing approval, insufficient permission | Hard stop; create approval or remediation task |
| Context failure | Missing facts, ambiguous entity mapping | Ask for missing context or trigger research subtask |
| Provider outage | Meta or Google service disruption | Open circuit breaker, queue retry, notify ops |

## Observability
Every ACP message emits correlated traces, structured logs, and audit events (OpenTelemetry).
