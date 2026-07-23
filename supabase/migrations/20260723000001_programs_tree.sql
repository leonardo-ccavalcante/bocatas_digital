-- 20260723000001_programs_tree.sql
--
-- Wave 1 schema for nested programs ("programas dentro de programas").
-- Adds hierarchical structure to programs: parent_id, tipo, inscribible,
-- estados_habilitados, plazas, etiquetas, plus an anti-cycle trigger.
--
-- Existence-tolerant: guards undefined_object/undefined_column/undefined_table
-- via DO blocks and IF NOT EXISTS patterns.

-- ============================================================================
-- 1. ADD COLUMNS TO programs (existence-tolerant)
-- ============================================================================

DO $$
BEGIN
  -- parent_id: self-referencing FK for hierarchy
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'programs' AND column_name = 'parent_id'
  ) THEN
    ALTER TABLE public.programs
      ADD COLUMN parent_id uuid NULL REFERENCES public.programs(id) ON DELETE RESTRICT;
  END IF;

  -- tipo: program type enum (stored as text with CHECK)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'programs' AND column_name = 'tipo'
  ) THEN
    ALTER TABLE public.programs
      ADD COLUMN tipo text NOT NULL DEFAULT 'basico';
  END IF;

  -- inscribible: whether persons can enroll directly
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'programs' AND column_name = 'inscribible'
  ) THEN
    ALTER TABLE public.programs
      ADD COLUMN inscribible boolean NOT NULL DEFAULT true;
  END IF;

  -- estados_habilitados: allowed enrollment states for this program
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'programs' AND column_name = 'estados_habilitados'
  ) THEN
    ALTER TABLE public.programs
      ADD COLUMN estados_habilitados text[] NOT NULL DEFAULT ARRAY['activo','pausado','baja','terminado'];
  END IF;

  -- plazas: max capacity (NULL = unlimited)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'programs' AND column_name = 'plazas'
  ) THEN
    ALTER TABLE public.programs
      ADD COLUMN plazas integer NULL;
  END IF;

  -- etiquetas: free-form tags
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'programs' AND column_name = 'etiquetas'
  ) THEN
    ALTER TABLE public.programs
      ADD COLUMN etiquetas text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- ============================================================================
-- 2. ADD CONSTRAINTS (existence-tolerant)
-- ============================================================================

DO $$
BEGIN
  -- CHECK for tipo values
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'programs_tipo_check' AND conrelid = 'public.programs'::regclass
  ) THEN
    ALTER TABLE public.programs
      ADD CONSTRAINT programs_tipo_check
      CHECK (tipo IN ('contenedor','curso','edicion','continuo','actividad','basico'));
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

DO $$
BEGIN
  -- CHECK for estados_habilitados subset
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'programs_estados_habilitados_check' AND conrelid = 'public.programs'::regclass
  ) THEN
    ALTER TABLE public.programs
      ADD CONSTRAINT programs_estados_habilitados_check
      CHECK (estados_habilitados <@ ARRAY['inscrito','preseleccionado','admitido','lista_espera','activo','pausado','baja','terminado','completado','rechazado']::text[]);
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

DO $$
BEGIN
  -- CHECK for plazas positive
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'programs_plazas_check' AND conrelid = 'public.programs'::regclass
  ) THEN
    ALTER TABLE public.programs
      ADD CONSTRAINT programs_plazas_check
      CHECK (plazas IS NULL OR plazas > 0);
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- ============================================================================
-- 3. ADD INDEX on parent_id (partial, WHERE parent_id IS NOT NULL)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_programs_parent
  ON public.programs (parent_id)
  WHERE parent_id IS NOT NULL;

-- ============================================================================
-- 4. ANTI-CYCLE TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.programs_assert_no_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_id uuid;
BEGIN
  -- Immediate self-reference check
  IF NEW.parent_id IS NOT NULL AND NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'A program cannot be its own parent (id=%)', NEW.id;
  END IF;

  -- Walk the ancestor chain to detect cycles
  IF NEW.parent_id IS NOT NULL THEN
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, 1 AS depth
      FROM public.programs
      WHERE id = NEW.parent_id
      UNION ALL
      SELECT p.id, p.parent_id, a.depth + 1
      FROM public.programs p
      INNER JOIN ancestors a ON p.id = a.parent_id
      WHERE a.depth < 100  -- safety limit
    )
    SELECT id INTO v_current_id
    FROM ancestors
    WHERE id = NEW.id
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Setting parent_id=% on program % would create a cycle', NEW.parent_id, NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 5. ATTACH TRIGGER (drop first to ensure clean state)
-- ============================================================================

DROP TRIGGER IF EXISTS trg_programs_assert_no_cycle ON public.programs;

CREATE TRIGGER trg_programs_assert_no_cycle
  BEFORE INSERT OR UPDATE OF parent_id ON public.programs
  FOR EACH ROW
  EXECUTE FUNCTION public.programs_assert_no_cycle();

-- ============================================================================
-- 6. GUARDED BACKFILL BY SLUG (tolerant if row absent)
-- ============================================================================

-- formacion -> tipo 'contenedor', inscribible=false (it's a container for courses)
UPDATE public.programs
SET tipo = 'contenedor', inscribible = false
WHERE slug = 'formacion' AND tipo = 'basico';

-- continuo programs: comedor, voluntariado, atencion_juridica, acompanamiento, programa_familias
UPDATE public.programs
SET tipo = 'continuo'
WHERE slug = 'comedor' AND tipo = 'basico';

UPDATE public.programs
SET tipo = 'continuo'
WHERE slug = 'voluntariado' AND tipo = 'basico';

UPDATE public.programs
SET tipo = 'continuo'
WHERE slug = 'atencion_juridica' AND tipo = 'basico';

UPDATE public.programs
SET tipo = 'continuo'
WHERE slug = 'acompanamiento' AND tipo = 'basico';

UPDATE public.programs
SET tipo = 'continuo'
WHERE slug = 'programa_familias' AND tipo = 'basico';

COMMENT ON COLUMN public.programs.parent_id IS 'UUID of parent program for nested hierarchy. NULL = top-level.';
COMMENT ON COLUMN public.programs.tipo IS 'Program type: contenedor, curso, edicion, continuo, actividad, basico.';
COMMENT ON COLUMN public.programs.inscribible IS 'Whether persons can enroll directly in this program.';
COMMENT ON COLUMN public.programs.estados_habilitados IS 'Allowed enrollment states for this program.';
COMMENT ON COLUMN public.programs.plazas IS 'Maximum enrollment capacity. NULL = unlimited.';
COMMENT ON COLUMN public.programs.etiquetas IS 'Free-form tags for filtering/grouping.';
