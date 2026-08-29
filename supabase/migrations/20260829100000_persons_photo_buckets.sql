-- ============================================================================
-- 20260829100000_persons_photo_buckets.sql
--
-- Create the private `fotos-perfil` and `documentos-consentimiento` Storage
-- buckets so a fresh `supabase db reset` provisions them every time.
--
-- Root cause: `server/routers/persons/photo.ts` uploaded to Manus object
-- storage (a flat, bucket-less keyspace) via `storagePut`, so these two names
-- lived only in that router's Zod enum and in
-- `client/src/features/persons/components/ConsentModal.tsx` — no Supabase
-- bucket was ever created for either. The project no longer uses Manus, so the
-- uploads now go to Supabase Storage and the buckets must actually exist, or
-- every upload fails with `StorageApiError: Bucket not found`. Same class as
-- gh #134 (`family-documents`).
--
-- Naming: these are the names the code ALREADY uses. A third spelling,
-- `consentimientos`, appears in
-- 20260411082152_20260410121500_create_storage_rls.sql — policies written
-- against a bucket that is created nowhere. That file is left untouched here
-- (its policies are inert either way, see the PII note below); renaming the
-- code to match a phantom would only move the mismatch around.
--
-- PII note: `fotos-perfil` holds beneficiary faces and
-- `documentos-consentimiento` holds photographs of wet-signed consent forms
-- (RGPD Art. 7 evidence). Both are PRIVATE — a public bucket serves an
-- unauthenticated, permanently replayable URL, which is exactly the CAS-02
-- finding. Consistent with ADR-0002 / ARCHITECTURE.md (issue #50), storage RLS
-- is NOT the enforcement boundary: all app access uses the service-role client
-- (which bypasses RLS) behind tRPC guards, and reads are served as short-lived
-- signed URLs. No storage.objects policy is defined here, matching
-- 20260724100000_family_documents_bucket.sql.
--
-- Size limit: `persons.uploadPhoto` is allow-listed for a 10 MB JSON body
-- (server/_core/index.ts LARGE_PAYLOAD_PATHS) and base64 inflates ~33%, so
-- 8 MiB decoded is the matching ceiling — a smaller bucket cap would turn an
-- accepted request into a storage-layer failure after the fact.
--
-- Existence-tolerant: ON CONFLICT (id) DO NOTHING so re-runs and any bucket
-- already created out-of-band are left untouched (settings are not clobbered).
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('fotos-perfil', 'fotos-perfil', false, 8388608, ARRAY['image/jpeg','image/png','image/webp']),
  ('documentos-consentimiento', 'documentos-consentimiento', false, 8388608, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;
