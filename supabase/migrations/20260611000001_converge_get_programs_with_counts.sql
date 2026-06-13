-- 20260611000001_converge_get_programs_with_counts.sql
--
-- CONVERGENCE migration (mythos/wave-1, 2026-06-11) — pairs with the in-place
-- 42P13 fix in 20260606000002.
--
-- Why this exists: 20260606000002 was edited in place to (a) stop aborting
-- fresh `supabase db reset` with 42P13 and (b) produce the canonical prod
-- return shape. That in-place edit only helps environments that apply 606 from
-- scratch (fresh CI / new dev / `db reset`). Any environment whose
-- supabase_migrations.schema_migrations already RECORDS 20260606000002 as
-- applied (e.g. prod, if it ran the original broken body) will NOT re-run the
-- rewritten 606 on a normal `supabase migration up` — it would keep the broken
-- shape, and programs.ts:99-103 then safeParses the RPC to [] (programs list
-- silently empty).
--
-- This is a NEW version, so it runs everywhere on the next `migration up`,
-- converging the function to the canonical shape regardless of 606's recorded
-- status. It is idempotent (DROP IF EXISTS) and byte-identical to the recreated
-- 606 body, so on a fresh apply it is a harmless no-op repeat.
--
-- Scope: convergence only. The STABLE-volatility optimization the function
-- would benefit from is a separate perf item (mythos-atlas) and is intentionally
-- NOT bundled here to keep this migration a pure, reviewable convergence step.

DROP FUNCTION IF EXISTS public.get_programs_with_counts() CASCADE;

CREATE FUNCTION public.get_programs_with_counts()
 RETURNS TABLE(
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
   new_this_month bigint
 )
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
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
    ) AS new_this_month
  FROM programs p
  LEFT JOIN program_enrollments pe ON pe.program_id = p.id
  GROUP BY p.id
  ORDER BY p.display_order
$function$;

-- Re-apply the SECURITY DEFINER hardening posture (migrations 20260506000006 +
-- 20260506000007): a fresh CREATE re-grants EXECUTE to PUBLIC by default, and
-- anon inherits PUBLIC.
REVOKE EXECUTE ON FUNCTION public.get_programs_with_counts() FROM PUBLIC, anon, authenticated;
