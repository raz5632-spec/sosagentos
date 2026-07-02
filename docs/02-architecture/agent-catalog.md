# Agent Catalog (24 agents)

Approval legend: **L0** autonomous within policy · **L1** autonomous but notify · **L2** manager approval · **L3** CEO approval · **L4** recommend only.
Confidence legend: **High** may proceed if approval level allows · **Medium** must validate or ask · **Low** cannot act, must escalate.

| Agent | Responsibility | Memory scope | Conf. threshold | Default approval | Retry / escalation |
|---|---|---|---|---|---|
| Supreme Orchestrator | Decompose intent, assign agents, maintain workflow state | Workflow-only + refs | 0.85 | L2 | No blind retries; reroute or escalate |
| CEO Interface Agent | Conversational front door for owner | Episodic session | 0.80 | L2–L4 | Ask clarifying question only if task-critical |
| Project Manager Agent | Goals → epics/features/tasks + status reports | Persistent project | 0.90 | L1 | Re-plan once, then escalate blockers |
| Model Router Agent | Choose Claude/OpenAI/Gemini per subtask | Stateless + usage telemetry | 0.90 | L0 | Fail over after 1 provider failure |
| Brand DNA Agent | Enforce S.O.S. tone, prohibited claims, style rules | Long-lived brand | 0.95 | L0–L2 | No retry without draft revision |
| Knowledge Intake Agent | Capture raw knowledge (files, calls, URLs, uploads) | Source-scoped episodic | 0.80 | L1 | Retry parse ×2, then manual review queue |
| Knowledge Curator Agent | Validate, classify, normalize, version knowledge | Department + KG refs | 0.90 | L2 | Stop on source conflict; escalate |
| Knowledge Graph Agent | Maintain entity/concept relationships | Central graph | 0.92 | L1 | Retry graph write once, then compensate |
| Student Intelligence Agent | Student profiles, progress, risk, style | Per-student departmental | 0.85 | L1–L2 | Validate against latest activity before notify |
| Coach Support Agent | Recommend interventions to coaches | Per-student + coach notes | 0.80 | L2 | Escalate low-confidence suggestions |
| Lesson Agent | Process lesson events (recording → summary → action items) | Per-lesson episodic | 0.88 | L1 | Retry STT/transcript processing once |
| Assignment Review Agent | Review, score, suggest revisions | Per-assignment | 0.85 | L2 | On rubric mismatch, stop and ask human |
| Research Agent | Market/sales/psychology/AI research with citations | Research-session | 0.90 if cited | L1–L2 | If insufficient sources, return insufficiency |
| Competitor Intelligence Agent | Track public competitor content and patterns | Competitor dossier | 0.88 | L1–L2 | Never bypass access controls; stop if non-compliant |
| Opportunity Agent | Observations → concrete business opportunities | Cross-functional working | 0.82 | L2 | Escalate when assumptions drive result |
| Content Strategy Agent | Decide what content should exist and why | Campaign | 0.88 | L2 | Re-brief once based on QA |
| Copy Agent | Generate copy and structured content assets | Draft-local | 0.90 | L2 | Route through DNA + QA before approval |
| Design Brief Agent | Convert content into Canva-ready briefs | Asset-local | 0.90 | L2 | Retry on missing brand asset refs |
| Publishing Readiness Agent | Check content before publish | Asset-local | 0.95 | L3 | Hard stop on compliance violation |
| Communications Agent | Draft/send student & customer communications | Thread | 0.88 | L2–L3 for sends | Respect provider retry-after headers |
| Analytics Agent | KPI and operational analytics | Central analytical | 0.92 | L1 | Retry query once; otherwise report degraded data |
| Digital Twin Agent | Simulations and scenario analysis | Simulation session | 0.80 | L4 default | No retry on assumption gaps; ask for scenario inputs |
| Automation Agent | Execute workflow logic and schedules | Workflow | 0.95 | L0–L2 by action | 3 retries with backoff; then escalate |
| Integration Agent | Provider adapters, OAuth, webhooks, tokens | Connector-scoped | 0.95 | L1–L2 | Obey provider retry rules + circuit breaker |
| Security & Compliance Agent | RBAC, secrets, retention, audit coverage | Policy only | 0.98 | L3–L4 critical | No retry; require remediation |
| Quality Review Agent | Fresh-context review of outputs and diffs | Fresh temp context | 0.92 | L1 | One review cycle, then human decision |
| Learning Promotion Agent | Graduate local memory to central knowledge | Learning pipeline | 0.90 | L2 | Stop on policy or source gaps |
