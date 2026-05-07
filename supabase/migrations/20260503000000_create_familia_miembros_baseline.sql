-- 20260503000000_create_familia_miembros_baseline.sql
--
-- Why this exists
--   The familia_miembros table was created on production via a manual SQL run
--   (or a migration that was never committed to the repo) before the project's
--   migration history was made canonical. Subsequent migrations
--   (20260504000001, 20260505000002, 20260505000003, 20260505000004,
--    20260506000001, 20260506000002) all assume the table exists and ALTER it
--   in additive ways.
--
--   The supabase/migrations/EXPORTED/ snapshot from 2026-05-05 was incomplete
--   per its own README ("~30 still to export"). On a fresh CI database
--   `supabase start` blows up at 20260504000001 with:
--     ERROR: relation "public.familia_miembros" does not exist
--
--   This migration synthesises the pre-2026-05-04 baseline schema directly
--   from the comment-block in 20260504000001 ("the live familia_miembros
--   table only has: id, familia_id, nombre, rol, relacion, estado,
--   fecha_nacimiento, documentacion_id, created_at, updated_at").
--
-- Idempotency
--   `CREATE TABLE IF NOT EXISTS` makes this a no-op against production
--   (where the table already exists from the lost original migration).
--   In CI's empty Postgres it creates the baseline so the subsequent ALTERs
--   apply cleanly. Index and CHECK guards likewise IF NOT EXISTS / DROP IF
--   EXISTS to stay safe under either path.
--
-- Sort order
--   Timestamp 20260503000000 sorts BEFORE 20260504000001
--   (the first migration that ALTERs this table).

CREATE TABLE IF NOT EXISTS public.familia_miembros (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id      uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  nombre          text NOT NULL,
  rol             text NOT NULL DEFAULT 'dependent',
  relacion        text,
  estado          text NOT NULL DEFAULT 'activo',
  fecha_nacimiento date,
  documentacion_id uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Original CHECK on relacion (pre-2026-05-05 — broadened later in
-- 20260505000003_extend_relacion_check_for_parentesco.sql).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'familia_miembros_relacion_check'
  ) THEN
    ALTER TABLE public.familia_miembros
      ADD CONSTRAINT familia_miembros_relacion_check
      CHECK (relacion IS NULL OR relacion = ANY (ARRAY[
        'parent'::text, 'child'::text, 'sibling'::text, 'other'::text
      ]));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_familia_miembros_familia_id
  ON public.familia_miembros(familia_id);

-- updated_at trigger (mirrors the helper used by other tables).
CREATE OR REPLACE FUNCTION public.update_familia_miembros_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS familia_miembros_update_updated_at ON public.familia_miembros;
CREATE TRIGGER familia_miembros_update_updated_at
  BEFORE UPDATE ON public.familia_miembros
  FOR EACH ROW EXECUTE FUNCTION public.update_familia_miembros_updated_at();
