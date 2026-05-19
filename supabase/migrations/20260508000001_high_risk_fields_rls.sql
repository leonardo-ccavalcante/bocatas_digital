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
-- `authenticated` is a Supabase-managed role and always exists; persons has
-- these columns by construction. No wrapping needed.
REVOKE SELECT (situacion_legal, recorrido_migratorio, foto_documento_url)
  ON public.persons FROM authenticated;

-- Step 2 — Persons + Families: grant column-level SELECT to elevated roles.
--
-- Two independent existence concerns:
--   • `admin_role` / `superadmin_role` may not exist on a fresh CI DB.
--     The stub migration 20260508000000_create_high_risk_roles_stub.sql
--     normally creates them, but defense-in-depth catches undefined_object
--     (SQLSTATE 42704) if it didn't run.
--   • `families` does NOT have the high-risk columns in this schema.
--     The migration header's "historical denormalized copies" comment was
--     speculative — pg_dump from prod confirms families has none of these
--     columns. On a DB without the denormalization, the families GRANT
--     fails with undefined_column (SQLSTATE 42703). The persons GRANT in
--     the same iteration would have rolled back too.
--
-- Restructured as a nested loop (role × table) so:
--   (a) per-iteration BEGIN/EXCEPTION isolates each GRANT — persons-side
--       success isn't rolled back when families-side fails.
--   (b) EXCEPTION catches all three "missing-object" SQLSTATEs uniformly
--       (undefined_object 42704, undefined_column 42703, undefined_table
--       42P01) so the migration is robust against the systemic
--       prod-vs-repo gap documented in EXPORTED/README.md.
--
-- TODO drop this wrapping once (a) admin_role + superadmin_role are
-- captured as proper CREATE ROLE migrations AND (b) the question of
-- whether families should carry denormalized high-risk columns is
-- resolved (it currently doesn't, per pg_dump verification). Tracks
-- task #11's broader prod-objects-not-in-repo gap.

DO $$
DECLARE
  role_name text;
  table_name text;
  role_names text[] := ARRAY['admin_role', 'superadmin_role'];
  table_names text[] := ARRAY['persons', 'families'];
BEGIN
  FOREACH role_name IN ARRAY role_names LOOP
    FOREACH table_name IN ARRAY table_names LOOP
      BEGIN
        EXECUTE format(
          'GRANT SELECT (situacion_legal, recorrido_migratorio, foto_documento_url) ON public.%I TO %I',
          table_name, role_name
        );
      EXCEPTION
        WHEN undefined_object THEN
          RAISE NOTICE 'skip GRANT on %.{high_risk_fields} to %: role not present in this DB',
            table_name, role_name;
        WHEN undefined_column THEN
          RAISE NOTICE 'skip GRANT on %.{high_risk_fields} to %: column(s) not present on this table',
            table_name, role_name;
        WHEN undefined_table THEN
          RAISE NOTICE 'skip GRANT on %.{high_risk_fields} to %: table not present in this DB',
            table_name, role_name;
      END;
    END LOOP;
  END LOOP;
END $$;

-- Step 3 — Families: revoke column-level SELECT from `authenticated`, but
-- only if the columns exist on this table (they don't in the canonical
-- schema; the comment in Step 2 explains). Same defensive catch as Step 2.
DO $$
BEGIN
  EXECUTE 'REVOKE SELECT (situacion_legal, recorrido_migratorio, foto_documento_url) ON public.families FROM authenticated';
EXCEPTION
  WHEN undefined_column THEN
    RAISE NOTICE 'skip REVOKE on families.{high_risk_fields}: column(s) not present on this table';
  WHEN undefined_table THEN
    RAISE NOTICE 'skip REVOKE on families.{high_risk_fields}: table not present in this DB';
END $$;

-- Step 4 — Force PostgREST to reload its schema cache so the new
-- column privileges take effect for the REST API immediately.
NOTIFY pgrst, 'reload schema';
