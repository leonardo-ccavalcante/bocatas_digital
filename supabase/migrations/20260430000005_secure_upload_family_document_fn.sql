-- Fix 1: Add role check inside upload_family_document to prevent RLS bypass.
-- The function is SECURITY DEFINER and was GRANTed to 'authenticated', meaning
-- any authenticated user (including voluntario) could call it via supabase.rpc()
-- from the browser, bypassing the tRPC adminProcedure guard and the RLS on
-- family_member_documents. The role check below is the real enforcement.
--
-- Fix 2 (comment accuracy): Replaces the misleading "concurrent calls serialize"
-- header comment. The GRANT TO authenticated is kept; the role check is the guard.

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
BEGIN
  -- Role check: only admin and superadmin may call this function.
  -- This is the primary enforcement barrier; the SECURITY DEFINER + authenticated
  -- GRANT combination would otherwise allow any logged-in user to invoke this
  -- RPC directly from the browser, bypassing tRPC middleware guards and the
  -- RLS policy on family_member_documents.
  IF public.get_user_role() NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Forbidden: upload_family_document requires admin or superadmin role';
  END IF;

  -- Mark prior current row(s) as not-current. Locks the rows for this family+member+doc_type.
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
    now(), p_verified_by, true
  )
  RETURNING * INTO v_inserted;

  RETURN v_inserted;
END;
$$;

-- GRANT remains on authenticated so the Supabase client (running as the user's
-- JWT) can reach the function. The role check inside enforces that only
-- admin/superadmin succeed; all other callers receive an exception.
GRANT EXECUTE ON FUNCTION public.upload_family_document(UUID, INTEGER, UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Fix 2: Accurate concurrency description replacing the earlier misleading comment.
-- Concurrent calls: the second caller's INSERT may raise unique_violation if the
-- partial UNIQUE index (idx_fmd_per_member / idx_fmd_family_level) is hit between
-- the UPDATE and INSERT steps. For the Bocatas use case (one device per session)
-- this is acceptable. If higher concurrency is ever needed, add
-- INSERT ... ON CONFLICT DO UPDATE or an advisory lock before the UPDATE.
COMMENT ON FUNCTION public.upload_family_document(UUID, INTEGER, UUID, TEXT, TEXT, TEXT) IS
  'Atomic version-rollover for family_member_documents. '
  'Marks the prior is_current=true row as not-current, then inserts a new current row. '
  'Role-gated: raises exception for any caller that is not admin or superadmin. '
  'Concurrency: a simultaneous second call may trigger unique_violation from the INSERT — '
  'acceptable for single-device-per-session Bocatas workflows. '
  'For higher concurrency add INSERT ... ON CONFLICT DO UPDATE or an advisory lock.';
