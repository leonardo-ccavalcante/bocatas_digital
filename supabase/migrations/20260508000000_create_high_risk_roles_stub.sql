-- ============================================================================
-- 20260508000000_create_high_risk_roles_stub.sql
--
-- STUB migration — creates the user-defined PostgreSQL roles that subsequent
-- migrations reference in GRANT, REVOKE, and CREATE POLICY statements.
--
-- WHY THIS IS A STUB
--
--   These roles were created in production via Supabase Dashboard or via
--   migrations that were never re-exported to the repo (see
--   supabase/migrations/EXPORTED/README.md, which lists ~30 missing
--   migrations). On a fresh CI / local DB the roles don't exist, so the
--   downstream migrations fail with:
--     ERROR: role "<name>_role" does not exist (SQLSTATE 42704)
--
--   This migration creates each role with MINIMAL privileges (NOLOGIN
--   NOINHERIT) — just enough for downstream CREATE POLICY and GRANT
--   statements to apply. The production roles likely have additional
--   GRANTs (membership in other roles, search_path, default privileges)
--   that we cannot reproduce without pg_dump access to the live cluster.
--
-- ROLE INVENTORY (kept in sync with grep of migrations/)
--
--   Sourced from exhaustive audit: grep TO/FROM/CREATE POLICY references
--   across all .sql files. Last audit: 2026-05-20. If a future CI failure
--   surfaces another role, ADD IT HERE — don't write a separate migration.
--
--   admin_role
--     Used by:  20260508000001_high_risk_fields_rls.sql (GRANT SELECT on
--               high-risk columns), 20260509000001_delivery_signature_audit.sql
--               (CREATE POLICY ... FOR SELECT TO admin_role).
--     Purpose:  Elevation target for admin-level reads of PII columns.
--
--   superadmin_role
--     Used by:  20260508000001_high_risk_fields_rls.sql,
--               20260509000001_delivery_signature_audit.sql,
--               20260509000002_firmas_entregas_storage_rls.sql,
--               20260512000001_create_family_webhook_log.sql.
--     Purpose:  Elevation target for superadmin-level reads.
--
--   voluntario_role
--     Used by:  20260509000001_delivery_signature_audit.sql (CREATE POLICY
--               ... FOR INSERT TO voluntario_role),
--               20260509000002_firmas_entregas_storage_rls.sql (CREATE
--               POLICY ... FOR INSERT TO voluntario_role for the
--               firmas-entregas storage bucket).
--     Purpose:  The role that records delivery signatures + uploads the
--               firma image. WRITE access; not read access on PII.
--
-- HOW THIS RELATES TO THE CANONICAL FIX
--
--   Task #11 (project task list) closed for functions (get_programs_with_counts,
--   rls_auto_enable) via the 20260505000998/999 captures. Roles remain as
--   stubs because (a) admin_role + superadmin_role don't exist in prod yet
--   either (their consuming migrations are PENDING REVIEW), (b) voluntario_role
--   likely exists in prod, but we can't pg_dump again until the token rotation
--   from 2026-05-20 is resolved. When the canonical role definitions land,
--   this stub gets REPLACED with proper CREATE ROLE statements that include
--   the actual GRANTs / membership relationships.
--
-- IDEMPOTENCY
--
--   Each CREATE ROLE is wrapped in BEGIN/EXCEPTION WHEN duplicate_object so
--   this migration applies cleanly against production (where some roles may
--   exist) AND against a fresh CI/local DB (where none do).
-- ============================================================================

DO $$
DECLARE
  role_name text;
  role_names text[] := ARRAY[
    'admin_role',
    'superadmin_role',
    'voluntario_role'
  ];
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
