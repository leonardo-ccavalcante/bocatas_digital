-- ============================================================================
-- 20260506210008_create_program_document_templates_bucket.sql
--
-- Storage bucket for blank templates + guides per document-type.
-- These files are NOT PII (they are blank forms / instructions),
-- so authenticated users can read; superadmin writes.
-- ============================================================================

-- Step 1 — Create the private bucket (idempotent guard).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'program-document-templates',
  'program-document-templates',
  false,
  10485760,  -- 10 MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'image/png',
    'image/jpeg'
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
    'image/jpeg'
  ];

-- Step 2 — Read: any authenticated user can read.
CREATE POLICY program_document_templates_authenticated_select
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'program-document-templates');

-- Step 3 — Write: superadmin only (INSERT).
CREATE POLICY program_document_templates_superadmin_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'program-document-templates' AND public.get_user_role() = 'superadmin');

-- Step 4 — Write: superadmin only (UPDATE).
CREATE POLICY program_document_templates_superadmin_update
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'program-document-templates' AND public.get_user_role() = 'superadmin')
  WITH CHECK (bucket_id = 'program-document-templates' AND public.get_user_role() = 'superadmin');

-- Step 5 — Write: superadmin only (DELETE).
CREATE POLICY program_document_templates_superadmin_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'program-document-templates' AND public.get_user_role() = 'superadmin');

-- Force PostgREST to reload its schema cache.
NOTIFY pgrst, 'reload schema';
