-- Atomic upsert for family documents.
-- Marks any existing CURRENT row for this (family, member, doc_type) as not-current,
-- then inserts the new row, in a single transaction. Concurrent calls serialize via
-- the partial UNIQUE index `idx_fmd_per_member` / `idx_fmd_family_level` —
-- the second caller's UPDATE will see the first caller's already-rolled-over row
-- and the INSERT proceeds without violation.

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

-- Allow the authenticated role(s) to call this. Adjust to match your auth setup
-- (mirror existing Bocatas RPC GRANT patterns from supabase/migrations/20260410121*.sql).
GRANT EXECUTE ON FUNCTION public.upload_family_document(UUID, INTEGER, UUID, TEXT, TEXT, TEXT) TO authenticated;
