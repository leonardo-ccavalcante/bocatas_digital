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
REVOKE SELECT (situacion_legal, recorrido_migratorio, foto_documento_url)
  ON public.persons FROM authenticated;

-- Step 2 — Persons table: grant column-level SELECT to elevated roles.
GRANT SELECT (situacion_legal, recorrido_migratorio, foto_documento_url)
  ON public.persons TO admin_role;
GRANT SELECT (situacion_legal, recorrido_migratorio, foto_documento_url)
  ON public.persons TO superadmin_role;

-- Step 3 — Families table (historical denormalized copies — guard the
-- same fields in case any deployment carries them on the families row).
REVOKE SELECT (situacion_legal, recorrido_migratorio, foto_documento_url)
  ON public.families FROM authenticated;

GRANT SELECT (situacion_legal, recorrido_migratorio, foto_documento_url)
  ON public.families TO admin_role;
GRANT SELECT (situacion_legal, recorrido_migratorio, foto_documento_url)
  ON public.families TO superadmin_role;

-- Step 4 — Force PostgREST to reload its schema cache so the new
-- column privileges take effect for the REST API immediately.
NOTIFY pgrst, 'reload schema';
