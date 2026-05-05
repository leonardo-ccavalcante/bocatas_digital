-- Migration: Migrate family members from families.miembros JSON to familia_miembros table
--
-- DO NOT APPLY. SUPERSEDED by 20260505000001_backfill_familia_miembros_from_json.sql.
--
-- This file represents Manus's original intent (b170c05). It was never successfully
-- applied — the live DB had a separate migration `migrate_miembros_data_v2` insert
-- the rows ahead of time without apellidos/documento/person_id (which didn't exist
-- on the table yet). The 20260505000001 migration backfills those rows in place.
--
-- The original INSERT below is left commented for historical reference. It would
-- fail on this DB because (1) the rows already exist and would be duplicated, and
-- (2) `parentesco` values like 'esposo_a'/'Amigo' violate the relacion CHECK
-- constraint.
--
-- INSERT INTO public.familia_miembros (...)
-- SELECT ... FROM public.families ...;

-- Step 2: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_familia_miembros_familia_id 
  ON public.familia_miembros(familia_id);

CREATE INDEX IF NOT EXISTS idx_familia_miembros_nombre 
  ON public.familia_miembros(nombre);

CREATE INDEX IF NOT EXISTS idx_familia_miembros_estado 
  ON public.familia_miembros(estado);

