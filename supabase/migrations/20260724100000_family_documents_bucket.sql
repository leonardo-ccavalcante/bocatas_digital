-- ============================================================================
-- 20260724100000_family_documents_bucket.sql — MYT-134 (gh #134)
--
-- Create the private `family-documents` Storage bucket in a migration so that a
-- fresh `supabase db reset` provisions it every time.
--
-- Root cause (gh #134): several routers (families/documents.ts, documents-gen.ts,
-- rounds-ocr.ts, rounds-documents.ts) and
-- server/services/__tests__/informeGen.live.integration.test.ts
-- (RUN_LIVE_INFORME_TESTS=1) read/write this bucket, and comments in
-- 20260430000001 / 20260430000002 / 20260521090003 assert it "must be created
-- separately via the Storage API / CLI" — but NO migration or seed.sql ever
-- created it. A fresh local stack therefore raised `StorageApiError: Bucket not
-- found`; prod only has it via the 2026-07-23 `POST /storage/v1/bucket`
-- workaround. This migration replaces that manual step (see docs/dev-setup.md).
--
-- PII note: the bucket holds high-risk documents (informe_social,
-- documento_identidad, actas). It is PRIVATE. Consistent with ADR-0002 /
-- ARCHITECTURE.md (issue #50), storage RLS is NOT the enforcement boundary — all
-- app access uses the service-role client (which bypasses RLS) behind tRPC admin
-- guards + `redactHighRiskFields`. No storage.objects RLS policy has ever been
-- defined for this bucket; this migration deliberately does not add one, keeping
-- parity with the workaround-created prod bucket. Access stays gated at the tRPC
-- layer (adminProcedure) and by short-lived signed URLs.
--
-- Existence-tolerant: ON CONFLICT (id) DO NOTHING so re-runs and the already
-- present prod bucket are left untouched (settings are not clobbered).
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('family-documents', 'family-documents', false)
ON CONFLICT (id) DO NOTHING;
