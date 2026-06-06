-- 20260606000002_fix_new_this_month_use_created_at.sql
--
-- Bug: get_programs_with_counts() counted new_this_month using pe.fecha_inicio
-- (the enrollment's START date, which is often set retroactively to the program
-- start date) instead of pe.created_at (when the enrollment record was actually
-- created). This caused inflated counts (e.g. 100 instead of the real number).
--
-- Fix: replace fecha_inicio with created_at in the new_this_month subquery.
-- The date_trunc('month', CURRENT_DATE) boundary is kept — only the column
-- changes.

CREATE OR REPLACE FUNCTION public.get_programs_with_counts()
RETURNS TABLE(
  id uuid,
  nombre text,
  slug text,
  description text,
  display_order integer,
  is_active boolean,
  requires_fields jsonb,
  volunteer_can_access boolean,
  requires_consents jsonb,
  fecha_inicio date,
  fecha_fin date,
  config jsonb,
  responsable_id uuid,
  active_enrollments bigint,
  total_enrollments bigint,
  new_this_month bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $function$
  SELECT
    p.id,
    p.nombre,
    p.slug,
    p.description,
    p.display_order,
    p.is_active,
    p.requires_fields,
    p.volunteer_can_access,
    p.requires_consents,
    p.fecha_inicio,
    p.fecha_fin,
    p.config,
    p.responsable_id,
    COUNT(CASE WHEN pe.estado = 'activo' AND pe.deleted_at IS NULL THEN 1 END) AS active_enrollments,
    COUNT(CASE WHEN pe.deleted_at IS NULL THEN 1 END) AS total_enrollments,
    COUNT(
      CASE
        WHEN pe.estado = 'activo'
         AND pe.deleted_at IS NULL
         AND pe.created_at >= date_trunc('month', CURRENT_DATE)
        THEN 1
      END
    ) AS new_this_month
  FROM programs p
  LEFT JOIN program_enrollments pe ON pe.program_id = p.id
  GROUP BY p.id
  ORDER BY p.display_order
$function$;

COMMENT ON FUNCTION public.get_programs_with_counts() IS
  'Returns programs with aggregated enrollment counts. SECURITY DEFINER so '
  'callers need only SELECT on programs. new_this_month counts enrollments '
  'created (created_at) since the start of the current calendar month — '
  'not fecha_inicio, which is often set retroactively.';
