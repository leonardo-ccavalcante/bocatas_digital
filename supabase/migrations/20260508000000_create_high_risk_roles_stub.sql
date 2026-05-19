-- ============================================================================
-- 20260508000000_create_high_risk_roles_stub.sql
--
-- STUB migration — creates the `admin_role` and `superadmin_role`
-- PostgreSQL roles that subsequent migrations (20260508000001,
-- 20260509000001, 20260509000002, 20260512000001) reference in GRANT
-- and CREATE POLICY statements.
--
-- WHY THIS IS A STUB
--
--   These roles exist in production (created at some point via Supabase
--   Dashboard or a migration that was never re-exported to the repo —
--   see supabase/migrations/EXPORTED/README.md, which lists ~30 missing
--   migrations). On a fresh CI / local DB they don't exist, so the
--   downstream migrations fail with:
--     ERROR: role "admin_role" does not exist (SQLSTATE 42704)
--
--   This migration creates the roles with the MINIMAL privileges needed
--   for downstream CREATE POLICY and GRANT statements to apply. The
--   production roles likely have additional GRANTs (membership in
--   other roles, search_path, etc.) that we cannot reproduce without
--   pg_dump access to the live cluster.
--
-- HOW THIS RELATES TO THE CANONICAL FIX
--
--   Task #11 in the project task list (see plan
--   .claude/plans/read-the-file-users-familiagirardicavalc-cheerful-meerkat.md)
--   is to pg_dump the production schema and capture missing role + function
--   definitions as proper migrations. When that work lands, this stub gets
--   REPLACED with the canonical CREATE ROLE statements pulled from prod
--   (including any GRANTs / membership relationships this stub omits).
--   Until then, this stub keeps CI green.
--
-- IDEMPOTENCY
--
--   Wrapped in a DO block with EXCEPTION WHEN duplicate_object so this
--   migration applies cleanly against production (where roles exist) AND
--   against a fresh CI/local DB (where they don't).
-- ============================================================================

DO $$
DECLARE
  role_name text;
  role_names text[] := ARRAY['admin_role', 'superadmin_role'];
BEGIN
  FOREACH role_name IN ARRAY role_names LOOP
    BEGIN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT', role_name);
      RAISE NOTICE 'created role % (stub)', role_name;
    EXCEPTION WHEN duplicate_object THEN
      RAISE NOTICE 'role % already exists, leaving as-is', role_name;
    END;
  END LOOP;
END $$;
