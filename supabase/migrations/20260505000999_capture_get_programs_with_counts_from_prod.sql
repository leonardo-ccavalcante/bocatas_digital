-- ============================================================================
-- 20260505000999_capture_get_programs_with_counts_from_prod.sql
--
-- CANONICAL — captures the get_programs_with_counts() function from
-- production into the repo's migration history.
--
-- BACKGROUND
--
--   This function exists in production (called by server/routers/programs.ts
--   line 87 via supabase.rpc("get_programs_with_counts")) but its
--   CREATE FUNCTION statement was never captured in a repo migration. It
--   was created at some point via Supabase Dashboard or a migration that
--   was lost from the repo — one of the ~30 gaps tracked in
--   supabase/migrations/EXPORTED/README.md.
--
--   The downstream migrations 20260506000006_phase2_advisor_fixes.sql and
--   20260506000007_phase2_revoke_public_authenticated_from_secdef.sql both
--   try to REVOKE EXECUTE on this function. They were made tolerant of
--   the missing function (DO block + EXCEPTION WHEN undefined_function)
--   but those tolerances are now defensive — the function will exist by
--   the time those migrations run (this migration is timestamped earlier).
--
-- SOURCE OF TRUTH
--
--   Body pulled from the live production cluster on 2026-05-20 via the
--   Supabase Management API SQL endpoint:
--
--     curl -X POST .../v1/projects/<ref>/database/query \
--       -d '{"query":"SELECT pg_get_functiondef(p.oid) ... '"'"'get_programs_with_counts'"'"'"}'
--
--   The function signature and body below are byte-identical to what
--   pg_get_functiondef returned from prod. Closes task #11 in the
--   parallel-implementation plan.
--
-- IDEMPOTENCY
--
--   CREATE OR REPLACE is safe against production (which already has the
--   function — replacing with the same definition is a no-op) AND against
--   a fresh CI/local DB (which doesn't have the function yet).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_programs_with_counts()
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
         AND pe.fecha_inicio >= date_trunc('month', CURRENT_DATE)
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
  'role-restricted callers (per the REVOKEs in _006/_007) still get the '
  'aggregate without needing direct SELECT on program_enrollments. '
  'Captured from prod 2026-05-20.';
