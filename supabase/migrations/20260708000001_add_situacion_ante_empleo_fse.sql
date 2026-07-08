-- ============================================================================
-- 20260708000001_add_situacion_ante_empleo_fse.sql
--
-- Adds `situacion_ante_empleo`: the IRPF/FSE "situación ante el empleo"
-- vulnerability status (INE/FSE reporting categories). This is ORTHOGONAL to
-- the existing `situacion_laboral` (employment TYPE) — it captures the
-- benefit/subsidy STATUS dimension the funder IRPF demographic report requires.
--
-- Additive & non-destructive by design (MECE two-dimension model): the existing
-- `situacion_laboral` enum/column is left completely untouched, so no data
-- migration of existing persons, no view/function/importer breakage.
--
-- Existence-tolerant / idempotent per repo convention.
-- ============================================================================

-- 1. Enum type (FSE/IRPF categories + honest catch-all).
DO $$
BEGIN
  CREATE TYPE situacion_ante_empleo AS ENUM (
    'inactiva',
    'desempleo_subsidio_larga_duracion',
    'agotada_prestacion_subsidio',
    'precariedad_laboral',
    'no_aplica'
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'type situacion_ante_empleo already exists, leaving as-is';
END $$;

-- 2. Column (additive).
ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS situacion_ante_empleo situacion_ante_empleo;

COMMENT ON COLUMN public.persons.situacion_ante_empleo IS
  'Situacion ante el empleo (categoria FSE/IRPF): inactiva / desempleo con '
  'subsidio de larga duracion / agotada prestacion-subsidio / precariedad '
  'laboral / no aplica. Ortogonal a situacion_laboral (tipo de empleo). '
  'Dimension que alimenta el informe demografico IRPF.';

-- 3. Best-effort HONEST backfill from the existing employment-type field.
--    Only where derivable WITHOUT fabricating a subsidy/vulnerability status:
--    jubilado / incapacidad_permanente are unambiguously out of the labour
--    force -> 'inactiva'. Everything else (desempleado, autonomo, empleo_*,
--    economia_informal, en_formacion, sin_permiso_trabajo) stays NULL — we do
--    NOT invent an FSE-reportable status the old enum never recorded.
UPDATE public.persons
   SET situacion_ante_empleo = 'inactiva'::situacion_ante_empleo
 WHERE situacion_ante_empleo IS NULL
   AND situacion_laboral IN ('jubilado', 'incapacidad_permanente');

-- 4. Reload PostgREST schema cache so the new column is exposed immediately.
NOTIFY pgrst, 'reload schema';
