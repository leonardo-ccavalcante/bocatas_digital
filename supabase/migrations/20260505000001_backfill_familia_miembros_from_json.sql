-- Backfill apellidos + relacion on existing familia_miembros rows
-- from the families.miembros JSON. Idempotent (touches only NULL apellidos).
-- Maps Spanish parentesco enum to English relacion enum (the column has a
-- CHECK constraint allowing parent/child/sibling/other).

UPDATE public.familia_miembros fm
SET
  apellidos = (json_member->>'apellidos')::text,
  relacion = CASE
    WHEN (json_member->>'parentesco') = 'hijo_a'    THEN 'child'
    WHEN (json_member->>'parentesco') IN ('madre','padre') THEN 'parent'
    WHEN (json_member->>'parentesco') = 'hermano_a' THEN 'sibling'
    ELSE 'other'
  END,
  updated_at = NOW()
FROM public.families f
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(f.miembros, '[]'::jsonb)) AS json_member
WHERE fm.familia_id       = f.id
  AND fm.nombre            = (json_member->>'nombre')::text
  AND fm.fecha_nacimiento IS NOT DISTINCT FROM (json_member->>'fecha_nacimiento')::date
  AND fm.apellidos IS NULL
  AND f.deleted_at IS NULL;
