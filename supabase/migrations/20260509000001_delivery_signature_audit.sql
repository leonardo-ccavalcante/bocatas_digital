-- ============================================================================
-- 20260509000001_delivery_signature_audit.sql
--
-- PENDING REVIEW — DO NOT APPLY WITHOUT RGPD LAWYER SIGNOFF.
--
-- Required signoff: CARTA_ABOGADO_RGPD.md item — confirm legal equivalence
-- of `signed_at` server-clock timestamp + `signer_person_id` binding for
-- IRPF audit and Banco de Alimentos subsidy verification (physical
-- signature replacement).
--
-- Purpose
--   Append-only audit ledger that binds every `deliveries` row carrying a
--   `firma_url` to (a) the person who signed, (b) the server-side clock
--   moment of signature, and (c) the SHA-256-hashed client IP. The unique
--   index guarantees one canonical signature per delivery. The audit row
--   is the legal evidence — `firma_url` alone is just the bitmap.
--
--   This separation is intentional: storage objects can be re-uploaded or
--   replaced; the audit row is referentially anchored to the delivery and
--   is INSERT-only at the row level (no UPDATE / DELETE policy granted to
--   any role except superadmin for legal correction).
--
-- WHY THIS IS NOT APPLIED YET
--   1. Lawyer signoff: server-clock `signed_at` must be confirmed legally
--      equivalent to a wet signature for Banco de Alimentos justification
--      reports. RGPD-specialized counsel must validate.
--   2. Hash policy: `client_ip_hash` is SHA-256 of (ip || daily_salt).
--      The salt rotation policy and salt storage location are TBD — must
--      land in EIPD before this migration ships.
--   3. Retention: legal retention period for IRPF audit is 4 years
--      minimum, but the EIPD allows 6 years for audit trails. Confirm
--      with counsel before adding a TTL / archival policy.
--   4. Signer identity: `signer_person_id` references `persons(id)`. For
--      the case where the signer is NOT the family head (es_autorizado =
--      true), confirm that any registered person can sign for any family.
--
-- ROLLBACK / DOWN
--   To revert (drop the audit table and its index):
--
--     DROP INDEX IF EXISTS public.delivery_signature_audit_one_per_delivery;
--     DROP TABLE IF EXISTS public.delivery_signature_audit;
--
-- ============================================================================

-- Step 1 — Audit table. Append-only by RLS policy below. References
-- deliveries(id) with ON DELETE CASCADE so that when a delivery is hard-
-- deleted (rare; soft-delete via deleted_at is the norm) the audit row
-- goes with it. References persons(id) with no cascade so we never lose
-- the signer binding silently.
CREATE TABLE delivery_signature_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  signer_person_id UUID NOT NULL REFERENCES persons(id),
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Step 2 — One canonical signature per delivery. INSERT a second row for
-- the same delivery_id is rejected at the DB level so that re-signature
-- attempts must go through an explicit superadmin DELETE + INSERT flow.
CREATE UNIQUE INDEX delivery_signature_audit_one_per_delivery
  ON delivery_signature_audit (delivery_id);

-- Step 3 — Lookup index for "who signed for which person?" reports.
CREATE INDEX delivery_signature_audit_signer_idx
  ON delivery_signature_audit (signer_person_id);

-- Step 4 — Enable Row Level Security.
ALTER TABLE delivery_signature_audit ENABLE ROW LEVEL SECURITY;

-- Step 5 — Policies. Voluntario can INSERT only. Admin / superadmin can
-- SELECT. No role gets UPDATE or DELETE — append-only ledger.
CREATE POLICY delivery_signature_audit_insert_voluntario
  ON delivery_signature_audit
  FOR INSERT
  TO voluntario_role
  WITH CHECK (true);

CREATE POLICY delivery_signature_audit_select_admin
  ON delivery_signature_audit
  FOR SELECT
  TO admin_role, superadmin_role
  USING (true);

-- Step 6 — Force PostgREST to reload its schema cache so the new table
-- is exposed via the REST API immediately.
NOTIFY pgrst, 'reload schema';
