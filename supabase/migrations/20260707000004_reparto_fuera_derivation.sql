-- Reparto fuera-de-Madrid derivation: expose families.codigo_postal to the
-- eligible-families feed so the assignment engine can auto-anchor beneficiaries
-- from outside Madrid to the reserved (es_fuera_madrid) slot. "Fuera de Madrid"
-- is decided in code (esFueraDeMadrid / madrid_distrito_for): a valid CP that
-- maps to no Madrid-city distrito.
--
-- The RETURNS TABLE signature changes, so the function must be dropped and
-- recreated; re-assert the service_role-only ACL that 20260613000001 locked.

DROP FUNCTION IF EXISTS public.get_eligible_families_for_reparto(uuid);

CREATE FUNCTION public.get_eligible_families_for_reparto(p_program_id uuid)
RETURNS TABLE (
  id uuid,
  familia_numero text,
  total_miembros integer,
  codigo_postal text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT DISTINCT
    f.id,
    f.familia_numero,
    (COALESCE(f.num_adultos, 1) + COALESCE(f.num_menores_18, 0))::integer AS total_miembros,
    f.codigo_postal
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

REVOKE EXECUTE ON FUNCTION public.get_eligible_families_for_reparto(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_eligible_families_for_reparto(uuid) TO service_role;
