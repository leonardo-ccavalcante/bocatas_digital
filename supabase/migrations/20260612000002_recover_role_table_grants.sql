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

-- PREREQUISITE for the anon grant below (cassandra CAS-01/CAS-02, P0).
-- The repo migration chain left `familia_miembros` and `program_sessions` with
-- RLS DISABLED — their policies (5 and 1) exist but are INERT. Prod has RLS
-- ENABLED on both (verified via MCP), so prod's anon grant is gated. Without
-- enabling RLS here FIRST, `GRANT ... TO anon` below would expose
-- familia_miembros PII (nombre/apellidos/documento/fecha_nacimiento) and
-- program_sessions writes to the public anon key with NO authentication
-- (confirmed at runtime: `SET ROLE anon; SELECT FROM familia_miembros` returns
-- rows). Recovering prod's RLS-enabled state activates the existing policies and
-- closes the exposure. service_role (the app's client) bypasses RLS, unaffected.
ALTER TABLE public.familia_miembros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_sessions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
