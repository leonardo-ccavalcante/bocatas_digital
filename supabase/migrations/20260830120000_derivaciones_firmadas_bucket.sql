-- 20260830120000_derivaciones_firmadas_bucket.sql
-- #168 (RC-31): create the PRIVATE bucket derivar.uploadSignedHoja writes to.
--
-- The bucket was never created by any migration — only referenced in code — so
-- every upload failed with "Bucket not found" (cleaned to a generic retry
-- message). "A bucket that only a shell script creates is a bug" (gh #134):
-- create it in a migration, existence-tolerant.
--
-- Private + PDF-only + 10 MiB: signed hojas carry beneficiary PII, so they must
-- never live in a public bucket (CAS-02 / ADR-0012). Read paths sign server-side.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('derivaciones-firmadas', 'derivaciones-firmadas', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;
