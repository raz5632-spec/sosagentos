# Google Playbook

OAuth 2.0 web-server flow: authorization-code exchange, access + refresh tokens, Bearer usage.
HTTPS redirect URIs, exact match. Quotas enforced per API; Gmail recommends truncated exponential backoff.

| Item | Guidance |
|---|---|
| OAuth client type | Web application (server-side flows) |
| Token storage | Encrypt refresh tokens; rotate credentials; store subject + scopes metadata |
| Scope strategy | Start narrow; incremental authorization where possible |
| Redirect URIs | HTTPS in production; exact-match configured URIs |
| Quota strategy | Per-provider rate limiter, exponential backoff, monitor quotas per API |
| Workspace use | Domain-wide delegation only if enterprise use case truly requires it |

## Scope suggestions

| Use case | API | Base scope policy |
|---|---|---|
| Calendar sync | Calendar API | Read/write only if SalesOS must schedule; otherwise read-only |
| File ingestion | Drive API | Read-only unless exporting artifacts back to Drive |
| Email drafts/sends | Gmail API | Draft-first pattern, then send on approval |
| Docs-based knowledge | Drive + Docs export | Read-only acquisition pipeline |
