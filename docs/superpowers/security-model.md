# Security Model — Access Control Boundary

> Output of the 2026-05-20 `/sat` QA pass (finding P2-3). The highest-leverage
> latent trap in this codebase: assuming RLS is the access boundary. It is not.

---

## TL;DR for anyone adding a tRPC procedure

1. **The service role bypasses RLS.** Every tRPC procedure builds its DB client via `createAdminClient()` (`client/src/lib/supabase/server.ts`), which uses `SUPABASE_SERVICE_ROLE_KEY`. The service role is a **superuser** — Postgres RLS policies do **not** apply to it.
2. **Therefore the procedure-type guard is the authoritative access boundary**, not RLS. Choose the right one in `server/_core/trpc.ts`:
   - `publicProcedure` — no auth
   - `protectedProcedure` — any authenticated user
   - `voluntarioProcedure` — voluntario + admin + superadmin
   - `adminProcedure` — admin + superadmin only
   - `superadminProcedure` — superadmin only
3. **Never rely on RLS to catch a missing guard.** If you forget `adminProcedure` on a procedure that reads `report_saved_queries`, a voluntario gets full access — the RLS policy on that table will NOT save you, because the service-role client never evaluates it.

## What RLS is actually for here

RLS policies are **defense-in-depth for the paths that do NOT use the service role**:
- Direct Supabase JS client calls from the browser with the **user's JWT** (e.g. Realtime subscriptions on the dashboard — `dashboard.realtime.integration.test.ts`).
- Any future code path that impersonates a user (`createServerClient` / `createUserImpersonationClient`).

So RLS is real and must stay correct — it just isn't the boundary the tRPC procedures rely on.

```
┌─────────────────────────────────────────────────────────────┐
│ Browser                                                       │
│   ├─ tRPC call ──► Express ──► procedure guard (AUTHORITATIVE) │
│   │                              └─► createAdminClient()       │
│   │                                   └─► service role         │
│   │                                        └─► RLS BYPASSED    │
│   │                                                            │
│   └─ Supabase JS (user JWT) ──────► RLS ENFORCED (the net)    │
└─────────────────────────────────────────────────────────────┘
```

## OUTPUT analogue — column projection (the reports lesson)

The procedure guard controls **who** can call. It does not control **which columns** come back. `createAdminClient()` + `.select("*")` returns every column — including high-risk PII (`situacion_legal`, `foto_documento_url`, `recorrido_migratorio`) — regardless of RLS column grants.

Rule for any procedure that returns persons/families-shaped rows:
- **Project explicitly.** Never `.select("*")` on a PII-bearing table. List the columns, or for the reports surface use the `ENTITY_FIELDS` allowlist (`shared/reports/entities.ts`) as the single source of truth for what may leave — see `server/routers/reports/customQuery/executor.ts` (`projectionFor`).
- For curated reads that legitimately need names, use `redactHighRiskFields` (`server/_core/rlsRedaction.ts`) at the procedure boundary so non-elevated roles never receive the high-risk set.
- **Enforced by a guard test:** `server/__tests__/persons-high-risk-readpath-guard.test.ts` fails CI if any server router reads `persons` via `.select("*")` without `redactHighRiskFields`. (`redactHighRiskFields` is a no-op for admin/superadmin, so it is always safe to add — even on admin-only reads.)

## The column-grant migration is NOT a live wall

`supabase/migrations/20260508000001_high_risk_fields_rls.sql` REVOKEs/GRANTs column-level SELECT on the high-risk fields. **It is documented defense-in-depth, deliberately NOT applied** (see its header's 4 staging preconditions), and — critically — **even if applied it would not protect the app's read path**, because the service role bypasses column grants just like it bypasses RLS. So it is a *future* hardening for the user-JWT path, **not** the boundary today. The real, present boundary for high-risk PII is: **explicit projection / `redactHighRiskFields` at the procedure, locked by the guard test above.** (Tracked: TECH_DEBT C-02.)

## High-risk PII fields (CLAUDE.md §3, restated)

`situacion_legal`, `foto_documento_url`, `recorrido_migratorio` are RLS-restricted to admin/superadmin AND must be excluded from:
- the reports `ENTITY_FIELDS` allowlist (drift-guarded by `shared/reports/__tests__/entities.test.ts`)
- any CSV export (the `exportRowsAsCsv` `redactFields` chokepoint)
- any log or error message (use IDs only — see `logAudit`)

## Audit logging

Compliance-relevant PII access should be audit-logged via `logAudit` (`server/_core/logging-middleware.ts`) — actor ID + entity + counts, **never PII values**. The arbitrary-query surface (`reports.customQuery.execute`) emits an audit record on every call.

---

*Keep this in sync with `server/_core/trpc.ts` (the guard definitions) and `server/_core/rlsRedaction.ts` (the redaction chokepoint).*
