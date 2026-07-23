-- 20260723000003_programs_counts_subtree.sql
--
-- Wave 1 schema: update get_programs_with_counts() to include tree columns
-- and subtree aggregations.
--
-- Follows the convergence pattern of 20260611000001_converge_get_programs_with_counts.sql:
--   DROP FUNCTION IF EXISTS ... CASCADE; CREATE; REVOKE EXECUTE FROM PUBLIC, anon, authenticated.
--
-- CRITICAL: The first 19 output columns MUST keep identical names/types/order to
-- the existing function. The server Zod passthrough-parses this shape; renaming
-- ANYTHING breaks prod. New columns are APPENDED after new_this_month.

DROP FUNCTION IF EXISTS public.get_programs_with_counts() CASCADE;

CREATE FUNCTION public.get_programs_with_counts()
 RETURNS TABLE(
   -- EXISTING COLUMNS (19) - DO NOT REORDER OR RENAME
   id uuid,
   slug character varying,
   name character varying,
   description text,
   icon character varying,
   is_default boolean,
   is_active boolean,
   display_order smallint,
   requires_fields jsonb,
   volunteer_can_access boolean,
   requires_consents text[],
   fecha_inicio date,
   fecha_fin date,
   config jsonb,
   responsable_id uuid,
   active_enrollments bigint,
   total_enrollments bigint,
   new_this_month bigint,
   -- NEW COLUMNS (9) - APPENDED
   parent_id uuid,
   tipo text,
   inscribible boolean,
   estados_habilitados text[],
   plazas integer,
   etiquetas text[],
   children_count bigint,
   subtree_active_persons bigint,
   subtree_total_persons bigint
 )
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH RECURSIVE subtree AS (
    -- Anchor: each program is the root of its own subtree
    SELECT
      p.id AS root_id,
      p.id AS node_id
    FROM programs p
    UNION ALL
    -- Recurse: add children
    SELECT
      st.root_id,
      child.id AS node_id
    FROM subtree st
    INNER JOIN programs child ON child.parent_id = st.node_id
  ),
  -- Aggregate subtree enrollments per root program
  subtree_agg AS (
    SELECT
      st.root_id,
      COUNT(DISTINCT CASE WHEN pe.estado = 'activo' AND pe.deleted_at IS NULL THEN pe.person_id END) AS subtree_active_persons,
      COUNT(DISTINCT CASE WHEN pe.deleted_at IS NULL THEN pe.person_id END) AS subtree_total_persons
    FROM subtree st
    LEFT JOIN program_enrollments pe ON pe.program_id = st.node_id
    GROUP BY st.root_id
  ),
  -- Count direct children per program
  children_agg AS (
    SELECT
      parent_id,
      COUNT(*) AS children_count
    FROM programs
    WHERE parent_id IS NOT NULL
    GROUP BY parent_id
  )
  SELECT
    -- EXISTING 19 COLUMNS (same logic as converge migration)
    p.id,
    p.slug,
    p.name,
    p.description,
    p.icon,
    p.is_default,
    p.is_active,
    p.display_order,
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
    ) AS new_this_month,
    -- NEW 9 COLUMNS
    p.parent_id,
    p.tipo,
    p.inscribible,
    p.estados_habilitados,
    p.plazas,
    p.etiquetas,
    COALESCE(ca.children_count, 0) AS children_count,
    COALESCE(sa.subtree_active_persons, 0) AS subtree_active_persons,
    COALESCE(sa.subtree_total_persons, 0) AS subtree_total_persons
  FROM programs p
  LEFT JOIN program_enrollments pe ON pe.program_id = p.id
  LEFT JOIN subtree_agg sa ON sa.root_id = p.id
  LEFT JOIN children_agg ca ON ca.parent_id = p.id
  GROUP BY
    p.id,
    p.slug,
    p.name,
    p.description,
    p.icon,
    p.is_default,
    p.is_active,
    p.display_order,
    p.requires_fields,
    p.volunteer_can_access,
    p.requires_consents,
    p.fecha_inicio,
    p.fecha_fin,
    p.config,
    p.responsable_id,
    p.parent_id,
    p.tipo,
    p.inscribible,
    p.estados_habilitados,
    p.plazas,
    p.etiquetas,
    ca.children_count,
    sa.subtree_active_persons,
    sa.subtree_total_persons
  ORDER BY p.display_order
$function$;

-- Re-apply the SECURITY DEFINER hardening posture (migrations 20260506000006 +
-- 20260506000007 + 20260611000001): a fresh CREATE re-grants EXECUTE to PUBLIC
-- by default, and anon inherits PUBLIC.
REVOKE EXECUTE ON FUNCTION public.get_programs_with_counts() FROM PUBLIC, anon, authenticated;

-- The app calls this RPC as `service_role` (service-role key). A fresh
-- DROP+CREATE does NOT re-grant the platform's blanket EXECUTE, so we must grant
-- it back explicitly or the admin catalog page 500s ("permission denied for
-- function"). service_role only — never anon/authenticated (they were revoked
-- above); it stays admin-only per the router's adminProcedure guard.
GRANT EXECUTE ON FUNCTION public.get_programs_with_counts() TO service_role;

COMMENT ON FUNCTION public.get_programs_with_counts() IS
  'Returns all programs with enrollment counts, tree metadata, and subtree aggregations.';
