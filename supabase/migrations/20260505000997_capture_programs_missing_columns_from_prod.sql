-- ============================================================================
-- 20260505000997_capture_programs_missing_columns_from_prod.sql
--
-- CANONICAL — captures programs columns that exist in production but were
-- never re-exported to the repo (same root cause as task #11; see
-- supabase/migrations/EXPORTED/README.md).
--
-- WHY THIS IS NEEDED
--
--   The base CREATE TABLE in EXPORTED/...create_programs.sql defines:
--     id, slug, name, description, icon, is_default, is_active,
--     display_order, requires_fields, created_at, updated_at, created_by
--
--   But database.types.ts (auto-generated from prod) declares 10 more:
--     config, deleted_at, fecha_inicio, fecha_fin, requires_consents,
--     responsable_id, session_close_config, volunteer_can_access,
--     volunteer_can_write, volunteer_visible_fields
--
--   These were added in prod via ALTER TABLE migrations that never made
--   it back to the repo. The next migration (20260505000999_capture_
--   get_programs_with_counts_from_prod.sql) creates a function that
--   SELECTs from programs and references several of these columns. On a
--   fresh CI / local DB, the function fails to create with:
--     ERROR: column p.volunteer_can_access does not exist (SQLSTATE 42703)
--
--   Adding these columns BEFORE the function-capture migration runs makes
--   `supabase start` succeed cleanly.
--
-- DEFAULTS
--
--   Each column type + default matches what database.types.ts declares
--   (boolean → DEFAULT false, text[] → DEFAULT '{}', jsonb → DEFAULT
--   '{}'::jsonb, dates / uuid → nullable, no default). These are
--   conservative defaults; production rows already have whatever values
--   were set when the columns were originally added in prod. The 6
--   default-seeded rows in CI get the conservative defaults — fine
--   because no tests depend on prod-specific values (the only consumer
--   `rpc-shape-validation.test.ts` validates shape, not values).
--
-- IDEMPOTENCY
--
--   ADD COLUMN IF NOT EXISTS is no-op against prod (columns exist) and
--   creates them in CI/local. Safe to re-run.
-- ============================================================================

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS volunteer_can_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS volunteer_can_write boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS volunteer_visible_fields text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS requires_consents text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS fecha_inicio date,
  ADD COLUMN IF NOT EXISTS fecha_fin date,
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS session_close_config jsonb,
  ADD COLUMN IF NOT EXISTS responsable_id uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- responsable_id likely has a FK to persons or auth.users in prod. We can't
-- know the exact reference target without a fresh schema dump (the token
-- granted for that work was rotated for security). The column type is uuid
-- and nullable, which is the minimum that lets the column exist for the
-- function-capture migration in 20260505000999 to succeed. If the prod FK
-- is needed locally for referential-integrity tests, a follow-up migration
-- can ALTER TABLE ... ADD CONSTRAINT once the reference target is confirmed.

COMMENT ON COLUMN public.programs.volunteer_can_access IS
  'Whether voluntario role can read this program. Captured from prod 2026-05-20.';
COMMENT ON COLUMN public.programs.volunteer_can_write IS
  'Whether voluntario role can write to this program. Captured from prod 2026-05-20.';
COMMENT ON COLUMN public.programs.volunteer_visible_fields IS
  'Allowlist of person-row field names visible to voluntario. Captured from prod 2026-05-20.';
COMMENT ON COLUMN public.programs.requires_consents IS
  'List of consent slugs required for enrollment in this program. Captured from prod 2026-05-20.';
COMMENT ON COLUMN public.programs.fecha_inicio IS
  'Program start date. Captured from prod 2026-05-20.';
COMMENT ON COLUMN public.programs.fecha_fin IS
  'Program end date. Captured from prod 2026-05-20.';
COMMENT ON COLUMN public.programs.config IS
  'Per-program JSONB config blob. Captured from prod 2026-05-20.';
COMMENT ON COLUMN public.programs.session_close_config IS
  'Closing-session configuration (Programa de Familias). Captured from prod 2026-05-20.';
COMMENT ON COLUMN public.programs.responsable_id IS
  'Program manager / responsable persona (uuid, nullable). Captured from prod 2026-05-20.';
COMMENT ON COLUMN public.programs.deleted_at IS
  'Soft-delete timestamp. Captured from prod 2026-05-20.';
