-- 20260506000007_phase2_revoke_public_authenticated_from_secdef.sql
-- Phase 2 follow-up: revoke EXECUTE from PUBLIC and authenticated for SECURITY DEFINER functions.
--
-- Why this is needed: Postgres default-grants EXECUTE to PUBLIC for new functions.
-- The anon role inherits from PUBLIC, so REVOKE FROM anon (in 20260506000006) had no effect.
-- This migration revokes from PUBLIC and authenticated explicitly.
--
-- Application impact: NONE. Server-side calls use createAdminClient() = service_role,
-- which retains EXECUTE. RLS policies still work because they execute as the
-- policy-owner (postgres), not as the calling role.
--
-- Result: clears anon_security_definer_function_executable + authenticated_security_definer_function_executable
-- advisors for all 7 functions.
--
-- Existence-tolerant per the same pattern as 20260506000006: some of these
-- functions (e.g. get_programs_with_counts) were created in production via
-- Dashboard edits that were never captured in repo migrations (see
-- supabase/migrations/EXPORTED/README.md). Bare top-level REVOKE statements
-- abort the whole transaction on a fresh CI DB. The DO block below skips
-- each missing function with NOTICE so this migration applies cleanly
-- whether or not the production-only functions have been re-exported.

BEGIN;

DO $$
DECLARE
  fn_signature text;
  fn_signatures text[] := ARRAY[
    'public.get_user_role()',
    'public.get_person_id()',
    'public.find_duplicate_persons(text, text, double precision)',
    'public.confirm_bulk_announcement_import(uuid, text, text)',
    'public.upload_family_document(uuid, integer, uuid, text, text, text)',
    'public.get_programs_with_counts()',
    'public.rls_auto_enable()'
  ];
BEGIN
  FOREACH fn_signature IN ARRAY fn_signatures LOOP
    BEGIN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, authenticated',
        fn_signature
      );
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'skip REVOKE on %: not present in this DB', fn_signature;
    END;
  END LOOP;
END $$;

COMMIT;
