# Meta Playbook — WhatsApp Cloud API + Instagram Messaging

Prefer official APIs, official scopes, official review flows, provider-native retry behavior.

## Implementation guidance

| Item | WhatsApp | Instagram Messaging |
|---|---|---|
| Auth pattern | System user / business token flow | User/business authorization via Meta |
| Minimum permissions | `whatsapp_business_management`, `whatsapp_business_messaging` | `instagram_basic`, `instagram_manage_messages`, `pages_manage_metadata` |
| Critical infra | Public HTTPS webhook + verification | Public HTTPS webhook + verification |
| Review requirement | Broader production scenarios / advanced use cases | Advanced Access required for production users |
| Token risk | Temporary tokens expire quickly; durable system-user token flow required | Token validity must align with App Review state |
| Operational hazards | 429s, messaging limits, template rules, phone registration | Capability mismatches, webhook subscriptions, access mode mismatch |

Notes: Cloud API default throughput up to 80 messages/sec per registered number (auto-upgrade paths up to 1,000 mps);
messaging limits and error codes enforced separately.

## Task checklist

| Task | Done when |
|---|---|
| Create Business Manager and Meta app | App exists with correct use case |
| Create system user and assign assets | System user has required business permissions |
| Configure webhook callback | Verification succeeds over HTTPS |
| Store secrets securely | Secrets only in secret manager, never repo |
| Request only needed permissions | Review request minimized and evidenced |
| Build idempotent webhook consumer | Duplicate events do not double-process |
| Handle retry-after / 429s | Backoff and circuit breaker implemented |
| Prepare App Review artifacts | Screencast, test accounts, step-by-step notes exist |
