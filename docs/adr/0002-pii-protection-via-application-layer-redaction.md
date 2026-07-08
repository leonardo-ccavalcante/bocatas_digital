# ADR-0002: PII protection via application-layer redaction

**Status:** Accepted

## Context

The platform handles sensitive PII for vulnerable people, including high-risk fields (`situacion_legal`, `foto_documento`, `recorrido_migratorio`) whose exposure could cause real harm. Supabase offers row-level security (RLS) at the database layer. However, in practice the app accesses the database with a service/admin client across the codebase (RLS is bypassed app-wide in the current architecture), so DB-level RLS is **not** the enforcement boundary that actually runs in production. A DB-RLS migration exists but is marked DO-NOT-APPLY.

Relying on DB RLS that isn't actually in the request path would be a false sense of security: the wall would not be load-bearing.

## Decision

Field-level PII protection is enforced at the **application layer** via a single function, `redactHighRiskFields`. This is the **sole** PII access boundary. High-risk fields are stripped from responses unless the caller's role is superadmin or admin.

- There is exactly one redaction boundary — do not scatter ad-hoc field filtering.
- No PII in QR codes (internal UUID only), no PII in logs or error messages (IDs only).
- The DB-RLS migration stays marked DO-NOT-APPLY until the architecture is deliberately changed; do not apply it as a "fix" without revisiting this ADR.

## Consequences

- A single, auditable, testable choke point for PII access — easy to reason about and review.
- **Fragile if bypassed:** any new query path that returns persona data must route through redaction. A direct query that skips it leaks high-risk fields. This is the project's single largest standing risk and must be checked in every review touching persona reads.
- Because protection is in code, not the DB, tests must assert redaction behavior per role — DB-level guarantees can't be assumed.
- If/when the app moves to per-request RLS, this decision should be superseded by a new ADR rather than silently dropping redaction.
