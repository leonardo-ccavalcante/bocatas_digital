-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260504184746 — name: migrate_miembros_data_v2

INSERT INTO public.familia_miembros (familia_id, nombre, rol, relacion, estado, fecha_nacimiento, created_at, updated_at)
SELECT
  f.id as familia_id,
  COALESCE((member->>'nombre')::text, 'Sin nombre') as nombre,
  COALESCE((member->>'rol')::text, 'dependent') as rol,
  (member->>'relacion')::text as relacion,
  COALESCE((member->>'estado')::text, 'activo') as estado,
  CASE
    WHEN (member->>'fecha_nacimiento') IS NOT NULL AND (member->>'fecha_nacimiento') != ''
    THEN (member->>'fecha_nacimiento')::date
    ELSE NULL
  END as fecha_nacimiento,
  NOW() as created_at,
  NOW() as updated_at
FROM public.families f
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(f.miembros, '[]'::jsonb)) as member
WHERE f.miembros IS NOT NULL
  AND jsonb_array_length(COALESCE(f.miembros, '[]'::jsonb)) > 0
ON CONFLICT DO NOTHING;
