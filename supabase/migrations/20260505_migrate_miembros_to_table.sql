-- Migration: Migrate family members from families.miembros JSON to familia_miembros table
-- Date: 2026-05-05
-- Purpose: Consolidate members into scalable relational table

-- Step 1: Migrate data from families.miembros JSON array to familia_miembros table
-- This inserts all members from the JSON array into the relational table
INSERT INTO public.familia_miembros (
  familia_id,
  nombre,
  apellidos,
  fecha_nacimiento,
  documento,
  person_id,
  rol,
  relacion,
  estado,
  created_at,
  updated_at
)
SELECT
  f.id as familia_id,
  (member->>'nombre')::text as nombre,
  (member->>'apellidos')::text as apellidos,
  (member->>'fecha_nacimiento')::date as fecha_nacimiento,
  (member->>'documento')::text as documento,
  (member->>'person_id')::uuid as person_id,
  COALESCE((member->>'rol')::text, 'dependent') as rol,
  (member->>'relacion')::text as relacion,
  COALESCE((member->>'estado')::text, 'activo') as estado,
  NOW() as created_at,
  NOW() as updated_at
FROM public.families f
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(f.miembros, '[]'::jsonb)) as member
WHERE f.miembros IS NOT NULL AND jsonb_array_length(COALESCE(f.miembros, '[]'::jsonb)) > 0
ON CONFLICT DO NOTHING;

-- Step 2: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_familia_miembros_familia_id 
  ON public.familia_miembros(familia_id);

CREATE INDEX IF NOT EXISTS idx_familia_miembros_nombre 
  ON public.familia_miembros(nombre);

CREATE INDEX IF NOT EXISTS idx_familia_miembros_estado 
  ON public.familia_miembros(estado);

-- Step 3: Verify migration success
-- This query shows how many members were migrated per family
-- SELECT 
--   f.id,
--   f.familia_numero,
--   COUNT(fm.id) as miembros_migrados,
--   jsonb_array_length(COALESCE(f.miembros, '[]'::jsonb)) as miembros_json_original
-- FROM public.families f
-- LEFT JOIN public.familia_miembros fm ON f.id = fm.familia_id
-- GROUP BY f.id, f.familia_numero, f.miembros
-- ORDER BY f.familia_numero;
