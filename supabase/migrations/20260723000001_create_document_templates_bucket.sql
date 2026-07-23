-- Migration: 20260723000001_create_document_templates_bucket.sql
--
-- Creates the `document-templates` storage bucket used by renderDocument()
-- to fetch the base .docx file for each template slug.
--
-- This bucket is PRIVATE (public=false). The server reads from it using the
-- service-role key (createAdminClient / fetchStorageBuffer). No direct
-- public access is needed or granted.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-templates',
  'document-templates',
  false,
  10485760,  -- 10 MB max per template file
  ARRAY[
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Only superadmin can upload/replace templates.
-- Reads are done server-side via service role (bypasses RLS), so no SELECT
-- policy is needed for authenticated users.
CREATE POLICY document_templates_bucket_superadmin_write
  ON storage.objects FOR ALL
  TO authenticated
  USING   (bucket_id = 'document-templates' AND public.get_user_role() = 'superadmin')
  WITH CHECK (bucket_id = 'document-templates' AND public.get_user_role() = 'superadmin');
