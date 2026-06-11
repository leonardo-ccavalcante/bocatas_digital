-- 20260612000002_recover_role_table_grants.sql
--
-- SYSTEMIC prod/repo gap (Mythos audit, surfaced during POS-01) — P0 for fresh
-- environments.
--
-- PROD grants the standard Supabase baseline: anon, authenticated and
-- service_role each hold SELECT/INSERT/UPDATE/DELETE on ALL public tables
-- (verified live via MCP — uniform across all 37 tables, 0 exceptions), plus
-- USAGE/SELECT on sequences. RLS + app-layer redaction are the access boundary,
-- NOT the grants. But the repo migration chain never establishes these grants —
-- on a fresh `supabase db reset`, all 37 tables have ZERO DML grants for these
-- roles (only REFERENCES/TRIGGER/TRUNCATE). So the app's service-role client
-- (createAdminClient) gets `42501 permission denied` on every table: a fresh
-- environment (CI ephemeral DB, new dev, staging) is a NON-FUNCTIONAL app, and
-- every live-DB integration test fails on setup. Verified: a service-role INSERT
-- into `persons` returns 42501 on a fresh reset.
--
-- This recovers prod's grant baseline EXACTLY. Idempotent (GRANT is a no-op when
-- already held). Runs last so `ON ALL TABLES` covers every table; ALTER DEFAULT
-- PRIVILEGES covers tables created by future migrations.
--
-- Scope: TABLES + SEQUENCES only. Deliberately does NOT touch FUNCTION grants —
-- the SECURITY DEFINER REVOKEs (get_programs_with_counts, sanitize_audit_error,
-- legacy-import fns) must stay intact. Security note for review (cassandra):
-- this matches prod's already-deployed posture; it does not widen access beyond
-- what prod already grants, and RLS (enabled on the sensitive tables) remains the
-- per-row boundary.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
