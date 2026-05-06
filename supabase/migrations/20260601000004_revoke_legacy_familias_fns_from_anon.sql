-- Defense-in-depth: REVOKE EXECUTE on the legacy FAMILIAS importer
-- functions from `anon` so the SECURITY DEFINER context can't be reached
-- by unauthenticated callers via /rest/v1/rpc/* even by accident.
--
-- The original migration (20260601000003) revoked from PUBLIC + authenticated
-- but anon is a separate role in Supabase that does NOT inherit those
-- revokes. The in-function get_user_role() check would deny anon with a
-- 42501 error, but skipping the public REST surface entirely is cleaner.
--
-- Verified post-apply with the Supabase database advisor: this clears
-- the `anon_security_definer_function_executable` lint for these three
-- functions. The `authenticated_security_definer_function_executable`
-- warning on confirm_legacy_familias_import is intentional and
-- acceptable: that's the entry point for the importer; the in-function
-- role check (admin/superadmin) is the actual gate.

REVOKE EXECUTE ON FUNCTION public.confirm_legacy_familias_import(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_legacy_person(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sanitize_audit_error(text) FROM anon;
