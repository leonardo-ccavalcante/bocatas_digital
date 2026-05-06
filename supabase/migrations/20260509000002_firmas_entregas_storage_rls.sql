-- ============================================================================
-- 20260509000002_firmas_entregas_storage_rls.sql
--
-- PENDING REVIEW — DO NOT APPLY WITHOUT RGPD LAWYER SIGNOFF.
--
-- Required signoff: CARTA_ABOGADO_RGPD.md item — confirm that bucket
-- privacy + voluntario INSERT-only + no-DELETE-anywhere semantics meet
-- the legal evidence retention requirements for IRPF audit and Banco
-- de Alimentos subsidy verification.
--
-- Purpose
--   Bucket `firmas-entregas` stores the bitmap rendering of a delivery
--   signature. The legal binding lives in `delivery_signature_audit`
--   (see migration 20260509000001). This migration locks the bucket so
--   that:
--     - SELECT  → admin_role, superadmin_role only (PII).
--     - INSERT  → voluntario_role only (the role that records deliveries).
--     - UPDATE  → no role.
--     - DELETE  → no role (append-only retention).
--
-- WHY THIS IS NOT APPLIED YET
--   1. Object name format contract (`firmas-entregas/{uuid}/{YYYY-MM-DD}.png`)
--      is enforced by the application layer (Zod refinement in
--      server/routers/families/deliveries.ts). Confirm with counsel that
--      the path-as-evidence claim does not require a DB-level CHECK.
--   2. Public access: bucket is private (no public URL). Confirm that
--      signed-URL TTL is set to <= 5 minutes for elevated-role reads.
--   3. service_role: object-level grants must NOT cascade to service_role
--      so that backend admin flows (lawyer audit export) keep working.
--
-- ROLLBACK / DOWN
--   To revert (drop policies and re-open bucket to authenticated):
--
--     DROP POLICY IF EXISTS firmas_entregas_select ON storage.objects;
--     DROP POLICY IF EXISTS firmas_entregas_insert ON storage.objects;
--     DELETE FROM storage.buckets WHERE id = 'firmas-entregas';
--
-- ============================================================================

-- Step 1 — Create the private bucket (idempotent guard).
INSERT INTO storage.buckets (id, name, public)
VALUES ('firmas-entregas', 'firmas-entregas', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Step 2 — SELECT policy: admin_role and superadmin_role only.
CREATE POLICY firmas_entregas_select
  ON storage.objects
  FOR SELECT
  TO admin_role, superadmin_role
  USING (bucket_id = 'firmas-entregas');

-- Step 3 — INSERT policy: voluntario_role only.
CREATE POLICY firmas_entregas_insert
  ON storage.objects
  FOR INSERT
  TO voluntario_role
  WITH CHECK (bucket_id = 'firmas-entregas');

-- Step 4 — Intentionally NO DELETE policy. Storage objects in this bucket
-- are append-only retention evidence. Hard-deletion requires a manual
-- superadmin DB session with explicit audit log entry — out of scope for
-- this migration.

-- Step 5 — Intentionally NO UPDATE policy. Re-signature must produce a
-- new audit row + new object; the existing object is immutable.

-- Step 6 — Force PostgREST to reload its schema cache.
NOTIFY pgrst, 'reload schema';
