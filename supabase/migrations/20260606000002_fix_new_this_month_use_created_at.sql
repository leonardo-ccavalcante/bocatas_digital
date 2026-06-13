-- 20260606000002_fix_new_this_month_use_created_at.sql
--
-- Bug (original intent): get_programs_with_counts() counted new_this_month
-- using pe.fecha_inicio (the enrollment's START date, often set retroactively
-- to the program start date) instead of pe.created_at (when the enrollment
-- record was actually created). This inflated counts (e.g. 100 instead of the
-- real number). Fix: count by pe.created_at; keep the
-- date_trunc('month', CURRENT_DATE) boundary.
--
-- ─── 42P13 REGRESSION FIX (mythos/wave-1, 2026-06-11) ───────────────────────
-- The ORIGINAL version of this migration ALSO rewrote the function's RETURNS
-- TABLE(...) shape (slug/name → nombre/slug, dropped icon + is_default,
-- requires_consents text[] → jsonb, display_order smallint → integer). Because
-- 20260505000999 already CREATE-OR-REPLACEd this function with the canonical
-- prod shape, PostgreSQL rejected the in-place return-type change on EVERY
-- fresh apply:
--
--     ERROR: cannot change return type of existing function (SQLSTATE 42P13)
--     DETAIL: Row type defined by OUT parameters is different.
--
-- That broke `supabase db reset` / `supabase start` for ALL fresh environments
-- (CI, staging, new dev), blocking every DB-backed verification. (The truncated
-- CLI stdout misattributed it to 20260601000005_sanitize_audit_error_*; the
-- live ErrorResponse names get_programs_with_counts() during this migration.)
--
-- The rewritten shape was ALSO wrong for the application: the programs router
-- Zod validator (server/routers/programs.ts:42-63) requires `name` (NOT
-- `nombre`), and client/src/lib/database.types.ts encodes the canonical prod
-- shape (name, icon, is_default, requires_consents string[]). Only the
-- new_this_month column logic was ever meant to change.
--
-- This migration is now self-healing and SHAPE-CORRECT:
--   * DROP FUNCTION IF EXISTS ... CASCADE — clears whatever shape is present
--     (canonical, broken, or absent). No CASCADE damage: live introspection
--     confirms zero dependent views / rules / triggers / functions.
--   * Recreate with the CANONICAL prod return shape.
--   * Apply the ONE intended change: new_this_month counts by pe.created_at.
--   * Re-apply the SECURITY DEFINER REVOKE posture from 20260506000006/000007
--     (a fresh CREATE re-grants EXECUTE to PUBLIC by default).
--
-- Editing this migration in place (rather than adding a later corrective one)
-- is the only fix that yields a green fresh reset: a strictly-later migration
-- cannot prevent this one from aborting the apply. Prod safety: prod's
-- migration history dedups by version, so if 20260606000002 is already
-- recorded as applied there, this rewritten body never re-runs on prod; if it
-- re-runs, it converges the function to the correct canonical+created_at state
-- that database.types.ts already expects.

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

COMMENT ON FUNCTION public.get_programs_with_counts() IS
  'Returns programs with aggregated enrollment counts. SECURITY DEFINER so '
  'role-restricted callers (per the REVOKEs in _006/_007) still get the '
  'aggregate without needing direct SELECT on program_enrollments. Return '
  'shape is the canonical prod shape (name/icon/is_default/text[]); '
  'new_this_month counts enrollments created (created_at) since the start of '
  'the current calendar month — not fecha_inicio, which is often backdated.';

-- Re-apply the SECURITY DEFINER hardening posture (migrations
-- 20260506000006 + 20260506000007). A fresh CREATE re-grants EXECUTE to PUBLIC
-- by default; anon inherits PUBLIC, so this REVOKE keeps a SECURITY DEFINER
-- function from being callable by anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.get_programs_with_counts() FROM PUBLIC, anon, authenticated;
