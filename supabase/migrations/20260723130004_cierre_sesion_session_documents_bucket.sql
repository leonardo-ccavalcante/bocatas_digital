-- ============================================================================
-- 20260723130004_cierre_sesion_session_documents_bucket.sql
--
-- Storage bucket for session close-out documents (uploaded plans, attendance
-- lists, photos, etc.). These are operational documents attached to sessions,
-- not personal PII documents.
--
-- Pattern mirrors program-document-templates bucket.
-- ============================================================================

-- Step 1 — Create the private bucket (idempotent guard).
-- FIX 1a: Reconcile bucket allowed_mime_types with the app ALLOWED_MIMES set.
--   Added: image/webp (needed for OCR photo uploads)
--          text/markdown (needed for OCR-save "Guardar plan" path)
--          text/plain (plain-text alternative to markdown)
--   NOTE: text/html is intentionally excluded (XSS vector). Any future
--         signed-URL endpoint MUST serve with Content-Disposition: attachment.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'program-documents',
  'program-documents',
  false,
  10485760,  -- 10 MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/markdown',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/markdown',
    'text/plain'
  ];

-- Step 2 — Read: authenticated users can read (operational documents, not PII).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'program_documents_authenticated_select'
      AND tablename = 'objects'
      AND schemaname = 'storage'
  ) THEN
    CREATE POLICY program_documents_authenticated_select
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'program-documents');
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Step 3 — Write: admin/superadmin (INSERT).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'program_documents_admin_insert'
      AND tablename = 'objects'
      AND schemaname = 'storage'
  ) THEN
    CREATE POLICY program_documents_admin_insert
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'program-documents'
        AND public.get_user_role() = ANY (ARRAY['superadmin', 'admin'])
      );
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Step 4 — Write: admin/superadmin (UPDATE).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'program_documents_admin_update'
      AND tablename = 'objects'
      AND schemaname = 'storage'
  ) THEN
    CREATE POLICY program_documents_admin_update
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'program-documents'
        AND public.get_user_role() = ANY (ARRAY['superadmin', 'admin'])
      )
      WITH CHECK (
        bucket_id = 'program-documents'
        AND public.get_user_role() = ANY (ARRAY['superadmin', 'admin'])
      );
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Step 5 — Write: admin/superadmin (DELETE).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'program_documents_admin_delete'
      AND tablename = 'objects'
      AND schemaname = 'storage'
  ) THEN
    CREATE POLICY program_documents_admin_delete
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'program-documents'
        AND public.get_user_role() = ANY (ARRAY['superadmin', 'admin'])
      );
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Force PostgREST to reload its schema cache.
NOTIFY pgrst, 'reload schema';
