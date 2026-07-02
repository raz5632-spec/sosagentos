# Canva Playbook

Canva Connect requires: Developer Portal integration, MFA on the developer account,
OAuth 2.0 Authorization Code + PKCE (SHA-256). Access tokens expire ~4 hours.
Scopes are per-user and per-resource type. Public integrations undergo Canva review.

Rate limits (endpoint-level): ~20 req/min design creation, ~100 req/min list-designs & folder listing,
~60 req/min autofills, separate export throttles. Exponential backoff on `too_many_requests`.

**Positioning for SalesOS:** Canva is a design *realization* layer, not the source of truth.
SalesOS creates approved, versioned design briefs and optionally creates/edits/exports designs
in Canva; canonical campaign logic remains in SalesOS.
