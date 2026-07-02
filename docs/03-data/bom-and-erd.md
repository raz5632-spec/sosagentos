# Business Object Model (BOM) and ERD

Everything important is an object; the system models the business, not incidental implementation.
Relational core (PostgreSQL) + graph-friendly overlay (edge tables) + vector retrieval (pgvector).

## Canonical object families

| Family | Canonical objects |
|---|---|
| Core business | Organization, User, Role, Membership, Student, CoachProfile, Course, Cohort, Lesson, Assignment, Submission, Feedback |
| Knowledge | KnowledgeItem, KnowledgeChunk, KnowledgeVersion, KnowledgeEdge, SourceDocument, Transcript, Recording |
| Decisioning | Decision, Insight, Recommendation, Opportunity, Approval |
| Content | ContentAsset, ContentVersion, Campaign, BrandRule, DesignBrief, PublishJob |
| Intelligence | ResearchBrief, ResearchArtifact, Competitor, CompetitorObservation, Trend, SimulationRun |
| Automation | Workflow, WorkflowVersion, WorkflowRun, TaskRun, Notification |
| Integrations | IntegrationConnection, OAuthCredential, WebhookEndpoint, WebhookEvent, ProviderJob |
| Systems & controls | Agent, AgentMemory, AuditEvent, TraceLink, ModelInvocation, CostLedger |

## ERD tables

| Entity | Key attributes | Relationships |
|---|---|---|
| organizations | id, name, slug, package_type, status | 1:N memberships, integrations, students, knowledge_items |
| users | id, email, display_name, status | 1:N memberships, approvals, comments, sessions |
| roles | id, code, description | N:M users via memberships |
| memberships | id, org_id, user_id, role_id, permissions_json | belongs to organization, user, role |
| students | id, org_id, user_id (nullable, unique — platform identity link, added 2026-07-02), primary_coach_user_id, stage, motivation_score, dropout_risk, retention_score, learning_style | N:1 org, N:1 coach, 1:N submissions, lesson_attendance |
| coach_profiles | user_id, specialties, max_capacity, active_flag | 1:1 users, 1:N students |
| courses | id, org_id, title, version, status | 1:N lessons, cohorts |
| cohorts | id, org_id, course_id, name, start_at, end_at | N:1 course, N:M students |
| lessons | id, org_id, course_id, scheduled_at, teacher_user_id, recording_id, transcript_id | N:1 course, 1:1 transcript, 1:N action_items |
| recordings | id, org_id, provider, storage_uri, duration_sec | 1:1 lesson |
| transcripts | id, org_id, lesson_id, text, stt_provider, quality_score | 1:1 lesson, 1:N knowledge_items |
| assignments | id, org_id, course_id, lesson_id, rubric_json, due_at | 1:N submissions |
| submissions | id, assignment_id, student_id, submitted_at, score, revision_required | N:1 assignment, N:1 student, 1:N feedback |
| feedback | id, submission_id, author_user_id, ai_generated, content, version | N:1 submission |
| decisions | id, org_id, type, objective, status, created_by, approval_level | 1:N insights, recommendations, approvals |
| insights | id, org_id, decision_id, type, confidence, summary | N:1 decision |
| recommendations | id, org_id, decision_id, action_type, confidence, rationale | N:1 decision |
| approvals | id, org_id, subject_type, subject_id, requested_by, approver_user_id, status | polymorphic: decisions, publish jobs, workflows |
| knowledge_items | id, org_id, type, title, status, source_type, source_ref, current_version_id | 1:N versions, 1:N chunks, N:M via edges |
| knowledge_versions | id, knowledge_item_id, version_no, content_hash, approved_by, approved_at | N:1 knowledge_item |
| knowledge_chunks | id, knowledge_item_id, seq, content, embedding, token_count, metadata_json | N:1 knowledge_item |
| knowledge_edges | id, org_id, from_item_id, to_item_id, relation_type, weight | item↔item graph |
| brand_rules | id, org_id, rule_type, rule_text, severity, active | used by DNA engine |
| content_assets | id, org_id, type, title, status, target_channel, source_decision_id | 1:N content_versions, 1:1 design_brief |
| content_versions | id, content_asset_id, version_no, body_json, qa_status | N:1 content_asset |
| design_briefs | id, content_asset_id, canva_template_id, format, constraints_json | 1:1 content_asset |
| campaigns | id, org_id, objective, target_audience, status | 1:N content_assets |
| competitors | id, org_id, name, handle, channels_json, tracking_status | 1:N observations |
| competitor_observations | id, competitor_id, observed_at, url, content_type, summary, signals_json | N:1 competitor |
| research_briefs | id, org_id, question, scope_json, status | 1:N research_artifacts |
| research_artifacts | id, research_brief_id, source_url, citation, relevance_score, summary | N:1 research_brief |
| workflows | id, org_id, code, name, trigger_type, approval_policy | 1:N workflow_versions, runs |
| workflow_versions | id, workflow_id, semver, definition_json, status | N:1 workflow |
| workflow_runs | id, workflow_id, version_id, status, started_at, ended_at | 1:N task_runs |
| task_runs | id, workflow_run_id, task_id, agent_code, priority, status, attempt_no | N:1 workflow_run |
| integration_connections | id, org_id, provider, scopes_json, status, connected_by | 1:N oauth_credentials, webhook_endpoints, provider_jobs |
| oauth_credentials | id, integration_connection_id, token_ref, refresh_ref, expires_at, subject | N:1 integration_connection |
| webhook_endpoints | id, integration_connection_id, provider, url, verification_status | 1:N webhook_events |
| webhook_events | id, webhook_endpoint_id, provider_event_id, received_at, processed_at, status, payload_json | N:1 endpoint |
| agents | id, code, department, model_policy_json, active | 1:N model_invocations, agent_memories |
| agent_memories | id, agent_id, scope_type, scope_ref, summary, promoted_flag | N:1 agent |
| model_invocations | id, agent_id, provider, model, prompt_hash, tokens_in, tokens_out, cost_usd | N:1 agent |
| audit_events | id, org_id, actor_type, actor_id, action, subject_type, subject_id, trace_id, payload_json | global audit ledger |
| reports | id, org_id, type, generated_at, period_start, period_end, body_json | derived analytics |
| kpi_snapshots | id, org_id, metric_code, ts, value, dimensions_json | analytics base table |
