-- =============================================================================
-- 20260723000002_reparto_eligibility_all_active_families.sql
-- Reparto redesign — a round now includes ALL active families, not just those
-- with a member enrolled in the program.
-- =============================================================================
-- Old model: get_eligible_families_for_reparto(program_id) joined families →
-- familia_miembros → program_enrollments (active). New product rule (Leo): the
-- reparto covers every active family in the DB. familia_miembros is SPARSE in
-- prod (397/604 families have zero member rows), so family SIZE must come from
-- the declared num_adultos + num_menores_18, never from counting member rows —
-- and GREATEST(...,1) guards against a 0+0 family producing total_miembros=0
-- (which the assignment batch's NOT NULL/CHECK would otherwise choke on).
--
-- ADDITIVE only: the old RPC stays until PR-2 switches the single caller
-- (getEligibleFamilies) and drops it, so this migration is inert on its own.
-- Parameterless — there is no program filter anymore.

CREATE OR REPLACE FUNCTION public.get_active_families_for_reparto()
RETURNS TABLE (
  id uuid,
  familia_numero text,
  total_miembros integer,
  codigo_postal text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.id,
    f.familia_numero,
    GREATEST(COALESCE(f.num_adultos, 1) + COALESCE(f.num_menores_18, 0), 1)::integer AS total_miembros,
    f.codigo_postal
  FROM families f
  WHERE f.estado = 'activa'
    AND f.deleted_at IS NULL
  ORDER BY f.familia_numero;
$$;

REVOKE EXECUTE ON FUNCTION public.get_active_families_for_reparto() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_active_families_for_reparto() TO service_role;
