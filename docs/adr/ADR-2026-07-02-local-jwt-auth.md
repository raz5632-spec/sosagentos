# ADR: Local JWT auth for v1, OIDC-ready abstraction

**Date:** 2026-07-02 · **Status:** accepted · **Task:** IAM-001

## Context
The master blueprint recommends an OIDC/SAML IdP (Keycloak self-hosted or managed).
Standing up Keycloak now adds significant operational surface while the platform has a
single tenant (org `sos`) and one human operator.

## Decision
v1 ships email+password login issuing short-lived JWTs, implemented inside `AuthModule`
behind a narrow interface (login → identity claims). Passwords use bcrypt. Tenant and role
enforcement live in guards that read only JWT claims + membership records — they do not
care who issued the identity.

## Consequences
- Migrating to OIDC later = swapping the token issuer inside AuthModule; guards unchanged.
- `users.password_hash` is nullable, so OIDC-only users are representable already.
- Multi-tenant SaaS phase (Phase 2) must revisit this before external customers onboard.

## Alternatives rejected
- Keycloak now: operational cost not justified at current scale.
- Managed IdP (Auth0/Clerk): recurring cost + vendor coupling before product validation.
