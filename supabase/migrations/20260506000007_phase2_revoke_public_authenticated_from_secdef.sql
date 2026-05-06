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

BEGIN;

REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_person_id() FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.find_duplicate_persons(text, text, double precision) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_bulk_announcement_import(uuid, text, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.upload_family_document(uuid, integer, uuid, text, text, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_programs_with_counts() FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, authenticated;

COMMIT;
