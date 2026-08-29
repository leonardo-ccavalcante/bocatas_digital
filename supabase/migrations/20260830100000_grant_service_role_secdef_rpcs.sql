-- 20260830100000_grant_service_role_secdef_rpcs.sql
--
-- RC-02 (QA findings F025/F048/F251/F157/F204): 20260506000007 revoked EXECUTE
-- FROM PUBLIC, authenticated on the SECURITY DEFINER RPCs, claiming
-- "service_role retains EXECUTE". False for these three: they were only ever
-- granted to the `authenticated` role (20260411181059, 20260501132517,
-- 20260430000005) and service_role relied on the PUBLIC default that the
-- revoke removed. Every createAdminClient().rpc() call has failed 42501 since:
-- persons.findDuplicates 500s on every keystroke, families.uploadFamilyDocument
-- and the announcements bulk-confirm always fail.
--
-- Fix 1: explicit GRANT EXECUTE ... TO service_role for the three functions
--   (AGENTS.md "SECURITY DEFINER functions — DROP+CREATE loses grants").
--   Deliberately NOT re-granted to anon or the authenticated role: the browser
--   never calls these RPCs; tRPC procedure guards are the PII/authz wall
--   (ADR-0002).
--
-- Fix 2: CREATE OR REPLACE upload_family_document WITHOUT the in-function role
--   gate added in 20260430000005. That gate read auth.jwt(), which is absent
--   under the service-role client (identity comes from the app layer per
--   ADR-0002), so it raised 'Forbidden' for every legitimate caller.
--   Authorization now lives solely in the tRPC adminProcedure
--   (server/routers/families/documents.ts uploadFamilyDocument) — guard
--   removal recorded here on purpose.
--   The replaced body also resolves p_verified_by (TEXT, an app-layer actor id
--   that may be non-UUID, e.g. the dev session id) against auth.users:
--   verified_by is uuid with an FK to auth.users(id), and the previous direct
--   insert of a TEXT value raised 42804 on every call.
--
-- CREATE OR REPLACE (never DROP) so the ACL is preserved; the explicit
-- service_role grant at the end re-asserts it regardless.

BEGIN;

-- Fix 1 — existence-tolerant re-grant (same DO-block shape as 20260506000007).
DO $$
DECLARE
  fn_signature text;
  fn_signatures text[] := ARRAY[
    'public.find_duplicate_persons(text, text, double precision)',
    'public.confirm_bulk_announcement_import(uuid, text, text)',
    'public.upload_family_document(uuid, integer, uuid, text, text, text)'
  ];
BEGIN
  FOREACH fn_signature IN ARRAY fn_signatures LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn_signature);
    EXCEPTION WHEN undefined_function OR undefined_object OR undefined_table OR undefined_column THEN
      RAISE NOTICE 'skip GRANT on %: not present in this DB', fn_signature;
    END;
  END LOOP;
END $$;

-- Fix 2 — replace upload_family_document (same signature, no role gate).
CREATE OR REPLACE FUNCTION public.upload_family_document(
  p_family_id UUID,
  p_member_index INTEGER,
  p_member_person_id UUID,
  p_documento_tipo TEXT,
  p_documento_url TEXT,
  p_verified_by TEXT
)
RETURNS family_member_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted family_member_documents;
  v_verified_by uuid;
BEGIN
  -- p_verified_by is the app-layer actor id and may be non-UUID (Manus openId,
  -- dev session id). verified_by is uuid with FK -> auth.users(id): resolve to
  -- a real auth user or NULL instead of raising 42804/22P02/23503.
  SELECT u.id INTO v_verified_by
    FROM auth.users u
   WHERE u.id::text = p_verified_by;

  -- Mark prior current row(s) as not-current. Locks the rows for this
  -- family+member+doc_type.
  UPDATE family_member_documents
     SET is_current = false
   WHERE family_id = p_family_id
     AND member_index = p_member_index
     AND documento_tipo = p_documento_tipo
     AND deleted_at IS NULL
     AND is_current = true;

  -- Insert the new current row.
  INSERT INTO family_member_documents (
    family_id, member_index, member_person_id,
    documento_tipo, documento_url,
    fecha_upload, verified_by, is_current
  )
  VALUES (
    p_family_id, p_member_index, p_member_person_id,
    p_documento_tipo, p_documento_url,
    now(), v_verified_by, true
  )
  RETURNING * INTO v_inserted;

  RETURN v_inserted;
END;
$$;

-- AGENTS.md rule: every convergence migration touching a SECURITY DEFINER
-- function ends with an explicit service_role grant.
GRANT EXECUTE ON FUNCTION public.upload_family_document(UUID, INTEGER, UUID, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.upload_family_document(UUID, INTEGER, UUID, TEXT, TEXT, TEXT) IS
  'Atomic version-rollover for family_member_documents. '
  'Marks the prior is_current=true row as not-current, then inserts a new current row. '
  'Authorization: tRPC adminProcedure (ADR-0002); EXECUTE granted to service_role only. '
  'verified_by resolves p_verified_by against auth.users; NULL when the actor id is not an auth user. '
  'Concurrency: a simultaneous second call may trigger unique_violation from the INSERT — '
  'acceptable for single-device-per-session Bocatas workflows.';

COMMIT;
