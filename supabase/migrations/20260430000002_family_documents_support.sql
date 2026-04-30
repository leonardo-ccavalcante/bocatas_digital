-- Migration: Family documents versioning, family-level sentinel, boolean cache backfill
--
-- This migration:
-- 1. Adds is_current column for yearly renewal versioning (informe_social, etc.)
-- 2. Relaxes member_index CHECK to allow -1 (family-level docs sentinel)
-- 3. Creates partial UNIQUE indexes for one-current-row enforcement
-- 4. Backfills boolean cache columns on families from EXISTS rule
--
-- NOTE: Storage bucket `family-documents` (private, RLS = admin/superadmin)
-- must be created separately via Supabase Storage API or `supabase storage` CLI.
-- See Manus IM handoff doc for the exact bucket-creation steps.

-- 1. Versioning column for renewable docs (yearly informe_social etc.)
ALTER TABLE family_member_documents
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true;

-- 2. Relax member_index check to allow -1 sentinel for family-level docs
ALTER TABLE family_member_documents
  DROP CONSTRAINT IF EXISTS family_member_documents_member_index_check;
ALTER TABLE family_member_documents
  ADD CONSTRAINT family_member_documents_member_index_check CHECK (member_index >= -1);

-- 3a. Drop old indexes if they exist (older migrations may have created them)
DROP INDEX IF EXISTS idx_fmd_per_member;
DROP INDEX IF EXISTS idx_fmd_family_level;

-- 3b. Partial UNIQUE: family-level — one current row per (family_id, documento_tipo)
CREATE UNIQUE INDEX idx_fmd_family_level
  ON family_member_documents (family_id, documento_tipo)
  WHERE member_index = -1 AND deleted_at IS NULL AND is_current = true;

-- 3c. Partial UNIQUE: per-member — one current row per (family_id, member_index, documento_tipo)
CREATE UNIQUE INDEX idx_fmd_per_member
  ON family_member_documents (family_id, member_index, documento_tipo)
  WHERE member_index >= 0 AND deleted_at IS NULL AND is_current = true;

-- 4a. Snapshot existing boolean cache state for safe rollback (idempotent)
CREATE TABLE IF NOT EXISTS families_pre_backfill_20260430 AS
  SELECT id, docs_identidad, padron_recibido, justificante_recibido,
         consent_bocatas, consent_banco_alimentos, informe_social
  FROM families
  WHERE 1 = 0;  -- structure only on first run

INSERT INTO families_pre_backfill_20260430
  SELECT id, docs_identidad, padron_recibido, justificante_recibido,
         consent_bocatas, consent_banco_alimentos, informe_social
  FROM families
  WHERE NOT EXISTS (
    SELECT 1 FROM families_pre_backfill_20260430 p WHERE p.id = families.id
  );

-- 4b. Backfill boolean cache from EXISTS rule (uploaded files only)
UPDATE families f SET
  docs_identidad = EXISTS (
    SELECT 1 FROM family_member_documents
    WHERE family_id = f.id AND documento_tipo = 'documento_identidad'
      AND documento_url IS NOT NULL AND deleted_at IS NULL AND is_current = true
  ),
  padron_recibido = EXISTS (
    SELECT 1 FROM family_member_documents
    WHERE family_id = f.id AND documento_tipo = 'padron_municipal'
      AND documento_url IS NOT NULL AND deleted_at IS NULL AND is_current = true
  ),
  justificante_recibido = EXISTS (
    SELECT 1 FROM family_member_documents
    WHERE family_id = f.id AND documento_tipo = 'justificante_situacion'
      AND documento_url IS NOT NULL AND deleted_at IS NULL AND is_current = true
  ),
  consent_bocatas = EXISTS (
    SELECT 1 FROM family_member_documents
    WHERE family_id = f.id AND documento_tipo = 'consent_bocatas'
      AND documento_url IS NOT NULL AND deleted_at IS NULL AND is_current = true
  ),
  consent_banco_alimentos = EXISTS (
    SELECT 1 FROM family_member_documents
    WHERE family_id = f.id AND documento_tipo = 'consent_banco_alimentos'
      AND documento_url IS NOT NULL AND deleted_at IS NULL AND is_current = true
  ),
  informe_social = EXISTS (
    SELECT 1 FROM family_member_documents
    WHERE family_id = f.id AND documento_tipo = 'informe_social'
      AND documento_url IS NOT NULL AND deleted_at IS NULL AND is_current = true
  );

-- TODO Phase 3: ENABLE ROW LEVEL SECURITY on family_member_documents + admin/superadmin policies
