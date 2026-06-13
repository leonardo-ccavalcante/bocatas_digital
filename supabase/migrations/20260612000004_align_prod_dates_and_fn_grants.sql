-- ─────────────────────────────────────────────────────────────────────────────
-- Align repo schema with prod + make audit helpers testable (Mythos Wave 5).
--
-- Surfaced by DIO-04: the new DB-integration CI lane activated 19 formerly
-- self-skipping test files against a fresh `supabase db reset`, and three
-- prod/repo gaps fell out (same class as Wave 1 — prod drifted via Studio /
-- captured-state misses):
--
--   1. announcements.published_at / expires_at are DATE in prod
--      (verified 2026-06-12 via information_schema on vqvgcsdvvgyubqxumlwn)
--      but 20260504184659 created them as timestamptz. Tests written against
--      prod expect DATE semantics. Align to prod. Idempotent: prod is already
--      date, so the DO block no-ops there.
--   2. public.check_soft_delete_schema(text[]) exists ONLY in prod — the
--      capture migration 20260520000001 explicitly deferred it ("defer to a
--      follow-up if tests start failing"). They now run, and fail. Definition
--      below is the verbatim prod export (pg_get_functiondef, 2026-06-12).
--   3. public.sanitize_audit_error(text) had EXECUTE revoked from PUBLIC
--      (20260601000005), leaving ACL {postgres=X/postgres}: the PII-masking
--      function works inside SECURITY DEFINER callers but cannot be invoked
--      (and therefore not tested) by service_role. Grant EXECUTE to
--      service_role only — anon/authenticated stay revoked.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. announcements date columns → DATE (no-op when already date)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'announcements'
      AND column_name = 'published_at' AND data_type <> 'date'
  ) THEN
    ALTER TABLE public.announcements
      ALTER COLUMN published_at TYPE date USING published_at::date;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'announcements'
      AND column_name = 'expires_at' AND data_type <> 'date'
  ) THEN
    ALTER TABLE public.announcements
      ALTER COLUMN expires_at TYPE date USING expires_at::date;
  END IF;
END $$;

-- 2. check_soft_delete_schema — verbatim prod definition
CREATE OR REPLACE FUNCTION public.check_soft_delete_schema(table_names text[])
 RETURNS TABLE(table_name text, has_deleted_at boolean, has_index boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ BEGIN RETURN QUERY SELECT t.tbl::text, EXISTS(SELECT 1 FROM information_schema.columns c WHERE c.table_name = t.tbl AND c.column_name = 'deleted_at' AND c.table_schema = 'public') AS has_deleted_at, EXISTS(SELECT 1 FROM pg_indexes i WHERE i.tablename = t.tbl AND i.indexname LIKE '%deleted_at%' AND i.schemaname = 'public') AS has_index FROM unnest(table_names) AS t(tbl); END; $function$;

REVOKE EXECUTE ON FUNCTION public.check_soft_delete_schema(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_soft_delete_schema(text[]) TO service_role;

-- 3. sanitize_audit_error — testable by service_role, still locked for others
GRANT EXECUTE ON FUNCTION public.sanitize_audit_error(text) TO service_role;

-- 4. deleted_at indexes present in prod but missing from repo migrations
--    (verbatim prod indexdefs, 2026-06-12; surfaced by the soft-delete audit
--    tests once check_soft_delete_schema existed). IF NOT EXISTS → no-op on prod.
CREATE INDEX IF NOT EXISTS idx_programs_deleted_at
  ON public.programs USING btree (deleted_at);
CREATE INDEX IF NOT EXISTS idx_family_member_documents_deleted_at
  ON public.family_member_documents USING btree (deleted_at);
