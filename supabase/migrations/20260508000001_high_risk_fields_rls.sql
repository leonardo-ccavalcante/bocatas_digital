-- ============================================================================
-- 20260508000001_high_risk_fields_rls.sql
--
-- PENDING REVIEW — DO NOT APPLY WITHOUT STAGING VALIDATION.
--
-- Purpose
--   Defense-in-depth column-level grants for high-risk PII fields on
--   `persons` (and historically denormalized copies on `families`):
--     - situacion_legal      (legal status — sensitive)
--     - recorrido_migratorio (migration history — sensitive)
--     - foto_documento_url   (document photo — high-risk)
--
--   Application-layer redaction is already enforced in the tRPC routers
--   (see server/_core/rlsRedaction.ts and the persons.getById /
--   families.getById call sites). This migration adds a second wall:
--   PostgreSQL column-level privileges revoked from `authenticated` and
--   regranted to `admin_role` and `superadmin_role` only.
--
-- WHY THIS IS NOT APPLIED YET
--   1. Schema cache: PostgREST caches column privileges. After applying
--      this migration in staging, run `NOTIFY pgrst, 'reload schema';`
--      and confirm SELECT through the REST API still returns 200 for
--      elevated roles and 403 (or row with NULLed columns, depending on
--      PostgREST version) for `authenticated`.
--   2. Existing service-role flows: the app uses service_role for all
--      reads (Manus OAuth — no Supabase JWT). Verify that service_role
--      retains full SELECT — column REVOKEs against `authenticated`
--      MUST NOT cascade to service_role.
--   3. Role infrastructure: confirm `admin_role` and `superadmin_role`
--      exist as PostgreSQL roles in staging. If they do not, this
--      migration must be preceded by a CREATE ROLE migration.
--   4. Behavior contract for non-elevated callers: decide whether to
--      revoke access (PostgREST returns "permission denied") or leave
--      access and rely on the app-layer helper. Current app-layer
--      redaction returns the row WITHOUT the fields. A column REVOKE
--      will surface as a hard error — confirm this is the desired UX.
--
-- ROLLBACK / DOWN
--   To revert (re-grant SELECT on the columns to `authenticated`):
--
--     GRANT SELECT (situacion_legal, recorrido_migratorio, foto_documento_url)
--       ON public.persons TO authenticated;
--     GRANT SELECT (situacion_legal, recorrido_migratorio, foto_documento_url)
--       ON public.families TO authenticated;
--     NOTIFY pgrst, 'reload schema';
--
-- ============================================================================

-- Step 1 — Persons table: revoke column-level SELECT from `authenticated`.
-- `authenticated` is a Supabase-managed role and always exists; no wrapping needed.
REVOKE SELECT (situacion_legal, recorrido_migratorio, foto_documento_url)
  ON public.persons FROM authenticated;

-- Step 2 — Persons + Families: grant column-level SELECT to elevated roles.
--
-- `admin_role` and `superadmin_role` were created in production but their
-- CREATE ROLE statements were never re-exported to the repo (see
-- supabase/migrations/EXPORTED/README.md — "~30 missing migrations"). On a
-- fresh CI DB the roles don't exist, so the bare GRANT statements fail
-- with `role "admin_role" does not exist` (SQLSTATE 42704 = undefined_object)
-- and abort the migration.
--
-- Same existence-tolerant pattern as 20260506000006 / 20260506000007:
-- iterate over role × table tuples, catch undefined_object per role, skip
-- with NOTICE. Production retains the GRANT (roles exist there); local + CI
-- get the column REVOKE from authenticated (Step 1) but no fallback grant.
-- That's safe because the app reads via service_role (CLAUDE.md §3 and
-- server/lib/supabase/server.ts createAdminClient), and service_role is
-- unaffected by column REVOKEs against `authenticated`.
--
-- TODO drop this wrapping once admin_role + superadmin_role are captured
-- as proper CREATE ROLE migrations from production (pg_dump path; tracks
-- task #11's broader prod-objects-not-in-repo gap).

DO $$
DECLARE
  role_name text;
  role_names text[] := ARRAY['admin_role', 'superadmin_role'];
BEGIN
  FOREACH role_name IN ARRAY role_names LOOP
    BEGIN
      EXECUTE format(
        'GRANT SELECT (situacion_legal, recorrido_migratorio, foto_documento_url) ON public.persons TO %I',
        role_name
      );
      EXECUTE format(
        'GRANT SELECT (situacion_legal, recorrido_migratorio, foto_documento_url) ON public.families TO %I',
        role_name
      );
    EXCEPTION WHEN undefined_object THEN
      RAISE NOTICE 'skip GRANT to %: role not present in this DB', role_name;
    END;
  END LOOP;
END $$;

-- Step 3 — Families: revoke column-level SELECT from `authenticated`.
REVOKE SELECT (situacion_legal, recorrido_migratorio, foto_documento_url)
  ON public.families FROM authenticated;

-- Step 4 — Force PostgREST to reload its schema cache so the new
-- column privileges take effect for the REST API immediately.
NOTIFY pgrst, 'reload schema';
