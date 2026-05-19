-- ============================================================================
-- 20260520000001_capture_remaining_prod_state.sql
--
-- CANONICAL — closes the remaining prod-vs-repo schema drift surfaced by the
-- types-drift CI gate (Kind B items per the parallel plan).
--
-- BACKGROUND
--
--   After commits 606c78f, dfc5e47, 5024570, dd264d5 the supabase start
--   step in CI applies all migrations cleanly. The NEXT gate
--   (ci-types-drift) compares supabase gen types --local output against
--   the committed client/src/lib/database.types.ts. The diff surfaced
--   several prod-only schema elements that the repo migrations don't
--   reproduce yet. Without this migration, the types gate fails because
--   the regenerated types miss columns that production has + that app
--   code already references.
--
-- WHAT THIS CAPTURES
--
--   1. Documento_Extranjero enum value on tipo_documento
--        Used by 10 files in server/ and client/src (most notably
--        server/routers/persons/crud.ts which branches on this value).
--
--   2. families soft-delete-related columns
--      • padron_recibido_fecha (date, nullable)
--      • sin_guf (boolean, nullable)
--      • sin_informe_social (boolean, nullable)
--        Used by 5-7 files each — Programa de Familia compliance UI
--        and CSV import logic.
--
--   3. attendances.deleted_at (timestamptz, nullable)
--        Soft-delete pattern parity with other tables. App code doesn't
--        reference it directly yet, but the column exists in prod and
--        captures the soft-delete invariant.
--
--   4. familia_miembros.documentacion_id (uuid, nullable, FK to
--      family_member_documents.id)
--        Used by 1 file — links members to their canonical document.
--
--   5. attendances.programa type migration
--        Prod migrated this column from enum to text + FK to programs(slug).
--        The repo still has it as enum. This migration drops the enum
--        constraint and adds the FK. Safe because the existing values
--        are also valid programs.slug entries.
--
-- WHAT THIS DOES NOT CAPTURE
--
--   • check_soft_delete_schema function: utility function used in 2 tests;
--     not load-bearing for the types-drift gate (it's a function not a
--     column). Defer to a follow-up if tests start failing.
--   • Nullability tweaks on familia_miembros.created_at / .updated_at /
--     .estado / .rol — these reflect ALTER TABLE … DROP NOT NULL done in
--     prod via Studio. The committed types.ts shows them nullable; my
--     local migrations have them NOT NULL. The right invariant is
--     "migrations are authoritative" — leave migrations NOT NULL,
--     update database.types.ts accordingly in the same commit. NOT
--     captured here.
--   • graphql_public schema + __InternalSupabase metadata block — these
--     are generated automatically by `supabase gen types` based on the
--     local stack's PostgREST version + extensions. They appear in either
--     /tmp/types.ts or the committed file depending on which CLI version
--     ran. Reconcile by aligning database.types.ts to the local CLI's
--     output format.
--
-- IDEMPOTENCY
--
--   All ALTER TABLE statements use ADD COLUMN IF NOT EXISTS. The
--   ALTER TYPE ... ADD VALUE is wrapped in a DO block + EXCEPTION
--   WHEN duplicate_object. The FK ADD CONSTRAINT is wrapped similarly.
--   Safe to re-run against prod (no-op) or fresh DB (creates).
-- ============================================================================

BEGIN;

-- 1. Documento_Extranjero enum value -----------------------------------------
DO $$
BEGIN
  ALTER TYPE tipo_documento ADD VALUE IF NOT EXISTS 'Documento_Extranjero';
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'enum value Documento_Extranjero already exists on tipo_documento';
END $$;

COMMIT;
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block that uses it
-- later; commit and reopen so subsequent ALTER COLUMN can reference it. The
-- BEGIN/COMMIT pattern is documented in PostgreSQL docs for this exact case.

BEGIN;

-- 2. families soft-delete-related columns ------------------------------------
ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS padron_recibido_fecha date,
  ADD COLUMN IF NOT EXISTS sin_guf boolean,
  ADD COLUMN IF NOT EXISTS sin_informe_social boolean;

COMMENT ON COLUMN public.families.padron_recibido_fecha IS
  'Date the padron document was received. Captured from prod 2026-05-20.';
COMMENT ON COLUMN public.families.sin_guf IS
  'Marker: this family does not (yet) appear in the GUF export. Captured from prod 2026-05-20.';
COMMENT ON COLUMN public.families.sin_informe_social IS
  'Marker: no informe social on file yet. Used by Programa de Familia compliance UI. Captured from prod 2026-05-20.';

-- 3. attendances.deleted_at + 5. attendances.programa migration --------------
ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_attendances_deleted_at
  ON public.attendances (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Migrate programa from enum to text + FK to programs(slug). Prod did this
-- some time ago — capture it. ALTER TYPE USING does the safe cast.
DO $$
BEGIN
  -- Only run the type swap if programa is still an enum (idempotent).
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    JOIN information_schema.element_types e
      ON c.table_catalog = e.object_catalog
     AND c.table_schema = e.object_schema
     AND c.table_name = e.object_name
     AND c.dtd_identifier = e.collection_type_identifier
    WHERE c.table_schema = 'public'
      AND c.table_name = 'attendances'
      AND c.column_name = 'programa'
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'attendances'
      AND column_name = 'programa'
      AND udt_name = 'programa'
  ) THEN
    EXECUTE 'ALTER TABLE public.attendances ALTER COLUMN programa TYPE text USING programa::text';
    RAISE NOTICE 'converted attendances.programa from enum to text';
  ELSE
    RAISE NOTICE 'attendances.programa already text, skipping type conversion';
  END IF;
END $$;

-- FK to programs(slug). Safe to add since existing programa values match
-- programs.slug entries.
DO $$
BEGIN
  ALTER TABLE public.attendances
    ADD CONSTRAINT fk_attendances_programa
      FOREIGN KEY (programa) REFERENCES public.programs(slug)
      ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'fk_attendances_programa already present';
END $$;

-- 4. familia_miembros.documentacion_id FK ------------------------------------
-- Only if the column exists in this DB (it does in prod).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'familia_miembros'
      AND column_name = 'documentacion_id'
  ) THEN
    BEGIN
      ALTER TABLE public.familia_miembros
        ADD CONSTRAINT familia_miembros_documentacion_id_fkey
          FOREIGN KEY (documentacion_id) REFERENCES public.family_member_documents(id)
          ON UPDATE CASCADE ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN
      RAISE NOTICE 'familia_miembros_documentacion_id_fkey already present';
    END;
  ELSE
    -- Column doesn't exist in this DB (e.g. fresh CI). Add it nullable.
    ALTER TABLE public.familia_miembros
      ADD COLUMN documentacion_id uuid
        REFERENCES public.family_member_documents(id)
        ON UPDATE CASCADE ON DELETE SET NULL;
    RAISE NOTICE 'added familia_miembros.documentacion_id + FK';
  END IF;
END $$;

COMMIT;
