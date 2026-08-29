-- ============================================================================
-- 20260829100001_announcement_images_bucket.sql
--
-- Create the PUBLIC `announcement-images` bucket in a migration so a fresh
-- `supabase db reset` provisions it every time.
--
-- Root cause: the bucket existed only via scripts/create_announcement_images_bucket.sh,
-- a manual out-of-band step. Same debt class as gh #134 (`family-documents`):
-- code writes to a bucket that no migration creates, so a fresh stack fails
-- with `StorageApiError: Bucket not found`. It went unnoticed because
-- announcements.uploadImage wrote to Manus object storage instead, and could
-- never run anyway (its input took `z.instanceof(File)` over a JSON transport).
--
-- PUBLIC on purpose, and the ONLY public bucket in this project: novedad
-- artwork is non-PII and is rendered by a plain <img src>. The creation script
-- states it outright — "DO NOT upload PII here. For PII (DNI, signed consents)
-- use the family-documents bucket." Every bucket holding beneficiary data is
-- private and read through short-lived signed URLs.
--
-- MIME list matches ALLOWED_MIME_TYPES in server/routers/announcements.uploadImage.ts
-- (jpeg, png, webp, gif — the script omitted gif, so a valid upload could be
-- rejected by the storage layer after passing the router's own guard).
--
-- Existence-tolerant: ON CONFLICT (id) DO NOTHING so the already-provisioned
-- prod bucket is left untouched.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'announcement-images',
  'announcement-images',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;
