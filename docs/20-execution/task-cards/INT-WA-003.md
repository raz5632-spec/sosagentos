# Task ID: INT-WA-003
Title: Build WhatsApp webhook ingestion and signature validation
Priority: Critical · Estimate: 8 hours
Dependencies: INT-WA-001 (Meta app scaffolding), INT-WA-002 (OAuth/system-user token storage)

## Goal
Receive WhatsApp webhook events, verify the handshake, persist raw events,
normalize supported event types, and enqueue downstream processing.

## Inputs
- Meta webhook verify token · App secret / signature verification config
- Supported event schema list · Tenant mapping rules

## Outputs
- Verified webhook endpoint · raw webhook_events writes
- Normalized provider event records · queue messages for downstream processors

## Files
- apps/api/src/integrations/meta/webhook.controller.ts
- apps/api/src/integrations/meta/signature.ts
- apps/api/src/integrations/meta/normalizers/*.ts
- packages/contracts/src/meta/*.ts
- packages/db/prisma/migrations/...
- apps/api/test/integrations/meta/webhook.e2e.spec.ts

## Database
webhook_endpoints · webhook_events · provider_jobs (optional downstream job record)

## APIs
- Internal POST /webhooks/meta/whatsapp
- Meta webhook verification handshake

## Acceptance criteria
- Handshake succeeds with valid verify token
- Invalid signatures rejected and logged
- Supported events persist raw payload + normalized payload reference
- Duplicate provider_event_id is idempotent
- Queue publishes downstream task on supported events

## Test cases
Valid challenge verification · invalid verify token · invalid signature ·
duplicate event replay · unsupported event ignored but audited ·
queue failure creates retryable state

## External actions required
- Configure webhook callback URL in Meta App Dashboard
- Subscribe app to WhatsApp webhook fields
- Ensure public HTTPS endpoint is reachable

## Definition of done
All acceptance criteria pass · E2E tests pass · runbook entry added · PM Mode report returned
