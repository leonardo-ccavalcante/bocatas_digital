-- RPC: get_eligible_families_for_reparto
-- Returns active families that have at least one person actively enrolled in the program.
-- Replaces the 3-step chained .in() queries in rounds-schedule.ts that fail with >100 person_ids.
CREATE OR REPLACE FUNCTION get_eligible_families_for_reparto(p_program_id uuid)
RETURNS TABLE (
  id uuid,
  familia_numero text,
  total_miembros integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT DISTINCT
    f.id,
    f.familia_numero,
    (COALESCE(f.num_adultos, 1) + COALESCE(f.num_menores_18, 0))::integer AS total_miembros
  FROM families f
  JOIN familia_miembros fm ON fm.familia_id = f.id AND fm.deleted_at IS NULL
  JOIN program_enrollments pe ON pe.person_id = fm.person_id
    AND pe.program_id = p_program_id
    AND pe.estado = 'activo'
    AND pe.deleted_at IS NULL
  WHERE f.estado = 'activa'
    AND f.deleted_at IS NULL
  ORDER BY f.familia_numero;
$$;
