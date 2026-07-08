# ADR-0012: The storage proxy authenticates and authorizes every object request

**Status:** Accepted

> Renumbered from a workspace-root draft ADR-0009 to **0012** during the #117 docs consolidation (content unchanged). The tracked ADR-0009 is a *different* decision (admin/AEAT report counts); this storage-proxy decision — CAS-02, already implemented on `main` — simply had no home in the versioned tree.

## Context

The Express app mounts `app.get('/manus-storage/*')` (`server/_core/storageProxy.ts`, wired at `index.ts:83`) with **no authentication**. The handler takes `req.path` as a storage key, presigns a GET via the forge service key, and 307-redirects to it. The rate-limiters scope only `/api/trpc` and `/api/oauth`; the proxy is outside them and has no `..`/traversal guard (CAS-02/THE-05, Mythos 2026-06-11).

The bucket behind it holds high-risk PII: `foto_documento` identity-document images, `documentos-consentimiento`, `family_member_documents`, delivery photos, and `firmas-entregas` signatures. Because the proxy presigns with the service key, it bypasses RLS entirely. Anyone holding a key string — a leaked URL, or a `voluntario` who saw a `documento_url` returned by a procedure — can download cross-family PII documents with zero auth re-check, and the presigned URL is freely shareable/replayable. Keys are `${bucket}/${Date.now()}-${random base36 8ch}.jpg` (~41 bits), not trivially enumerable (which keeps it off P0), but that is obscurity, not access control.

This is a **new** hole, distinct from the deliberately-deferred DB-RLS lockdown (issue#50, ADR-0002). ADR-0002 established that PII protection is enforced at the application boundary; an unauthenticated proxy that hands out service-key presigns is a second PII egress path that bypasses that boundary.

## Decision

The storage proxy MUST authenticate the caller and authorize the specific object before presigning:

- Authenticate the request (the same session/JWT mechanism the tRPC layer uses) — reject unauthenticated requests with 401.
- Authorize: verify the caller is permitted to access the key's owning family/person (or that the key belongs to a resource the caller's role may read) — reject with 403 otherwise. High-risk document buckets follow the same elevated-role rule as `redactHighRiskFields` (superadmin/admin).
- Reject path traversal (`..`) and keys outside the allowed bucket prefixes.
- Presigned URLs get the shortest practical TTL; the proxy is the choke point, not a public CDN.

## Consequences

- The storage egress path is brought under the same access boundary as `redactHighRiskFields` (ADR-0002) — there is no longer an unauthenticated route to identity-document images and signatures.
- Any client that relied on hitting `/manus-storage/*` without a session must now send credentials; in-app fetches already have them, so the change is transparent to the SPA but breaks any out-of-band/leaked-URL access (which is the point).
- A small per-request authorization lookup (key → owning family → caller permission) is added to the proxy hot path; cache where safe, but correctness wins over the microseconds.
- This complements, and does not replace, ADR-0002: app-layer redaction still governs field-level PII in tRPC responses; this ADR governs object-level PII via the proxy. Neither depends on the deferred DB-RLS migration.
