-- ─────────────────────────────────────────────────────────────────────────────
-- Wave 7 (Mythos CAS-ANON-RPC, P1): lock down anon-reachable SECURITY DEFINER RPCs
--
-- Found by the first review-time advisors run (MCP get_advisors, tokenless):
-- 6 SECURITY DEFINER functions in `public` were EXECUTE-able by the `anon`
-- and/or PUBLIC roles. SECURITY DEFINER runs as the owner (postgres) and
-- BYPASSES RLS, so any caller with the public anon key could reach them via
-- PostgREST `/rest/v1/rpc/<fn>` — bypassing the tRPC + redaction boundary that
-- is the app's only PII wall (issue #50). Direct table access by `anon` is
-- already denied by RLS (no anon/public policy returns rows; verified
-- 2026-06-13), so these 6 functions were the ONLY anon-reachable RLS bypass.
--
-- The app reaches these via the SERVICE_ROLE server client (createAdminClient)
-- or — for the two legacy-import RPCs — via a server-minted `authenticated` JWT
-- (createUserImpersonationClient). So:
--   * service_role keeps EXECUTE where the server calls it.
--   * confirm_legacy_familias_import + enrich_families_from_informes KEEP
--     `authenticated` (the import flow calls them as authenticated); we only
--     strip PUBLIC + anon.
--     SECURITY NOTE (cassandra): `authenticated` is NOT server-mint-only — this
--     project's GoTrue allows self-signup, so a browser with just the anon key
--     can mint an authenticated JWT. Keeping EXECUTE for authenticated is
--     therefore NOT the security boundary for these two. Their real guards are
--     (a) an in-body `get_user_role()` admin check reading server-controlled
--     app_metadata.role (a self-signup JWT defaults to non-admin → RAISE
--     'forbidden'), and (b) the single-use bulk_import_previews token. Verified
--     live: a self-signup JWT hits the in-body RAISE, not the data. (Prod should
--     also disable GoTrue signup — the app uses Manus OAuth, not Supabase Auth.)
--   * the others lose PUBLIC + anon + authenticated (postgres/service_role only).
--
-- Idempotent + safe on both a fresh repo reset and the drifted prod ACL
-- (REVOKE of an absent grant is a no-op). Targets the EXACT current signatures
-- (e.g. the 4-arg confirm, not the stale 2-arg of 20260601000004). search_path
-- hardening intentionally NOT bundled (karpathy): with anon EXECUTE revoked +
-- anon table-writes denied by RLS, the search_path_mutable WARN has no live
-- exploit path — fixing it here would be linter-appeasement, not a fix.
--
-- NOT applied to prod by tooling — ships via the normal deploy. Verified
-- locally: anon RPC → 42501 permission denied; authenticated still executes
-- confirm/enrich; service_role unaffected; full server suite green.
-- ─────────────────────────────────────────────────────────────────────────────

-- Least-privilege per caller: REVOKE from everyone, then GRANT back ONLY the
-- role that legitimately invokes each fn. CRITICAL — get_eligible/upsert/backfill
-- relied on the DEFAULT PUBLIC grant for execute, so a bare `REVOKE FROM PUBLIC`
-- also strips service_role's (PUBLIC-inherited) access and breaks the server
-- path. We therefore GRANT the needed role explicitly (verified locally:
-- service_role got 42501 on get_eligible after a bare revoke).

-- Internal-only helpers (PERFORM'd inside confirm_legacy_familias_import, which
-- runs as its owner=postgres; owner always executes). No external caller →
-- nobody but the owner needs EXECUTE. Fully locked.
REVOKE EXECUTE ON FUNCTION public.upsert_familia_enrollment(uuid, uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.backfill_legacy_person(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

-- Dead function: created default-PUBLIC in 20260610000001, SECURITY DEFINER,
-- reads families + family_member_documents (RLS bypass), returns family ids —
-- but the documentosFaltantes report router reimplemented the logic in TS
-- (direct table reads via service_role) and NOTHING calls this RPC (no .rpc()
-- caller in repo). It was the 7th anon-reachable RLS bypass (cassandra; missed
-- by the prod completeness sweep because prod lacks 20260610000001 — drift).
-- Fully lock to the owner; flag for a separate dead-code DROP follow-up.
REVOKE EXECUTE ON FUNCTION public.get_documentos_faltantes(uuid)
  FROM PUBLIC, anon, authenticated;

-- Reparto eligibility read — called by an adminProcedure via service_role
-- (createAdminClient; server/routers/families/rounds-schedule.ts). Was still
-- default-PUBLIC in repo (created in 20260606000001 with no grant).
REVOKE EXECUTE ON FUNCTION public.get_eligible_families_for_reparto(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_eligible_families_for_reparto(uuid) TO service_role;

-- Schema-audit helper — called via service_role (server/db/soft-delete-audit.ts).
-- 20260612000004 already locked + granted service_role; re-asserted here so this
-- migration is self-contained and correct on the drifted prod ACL too.
REVOKE EXECUTE ON FUNCTION public.check_soft_delete_schema(text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_soft_delete_schema(text[]) TO service_role;

-- Legacy-import RPCs — invoked by the server as `authenticated`
-- (createUserImpersonationClient, a JWT signed with the server-only
-- SUPABASE_JWT_SECRET; not assumable by a browser holding the anon key).
-- Strip PUBLIC + anon; (re-)assert authenticated so the import flow keeps working.
REVOKE EXECUTE ON FUNCTION public.confirm_legacy_familias_import(uuid, text, text, text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_legacy_familias_import(uuid, text, text, text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.enrich_families_from_informes(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enrich_families_from_informes(uuid, text) TO authenticated;
