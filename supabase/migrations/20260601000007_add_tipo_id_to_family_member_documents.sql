-- ============================================================================
-- 20260601000007_add_tipo_id_to_family_member_documents.sql
--
-- Purpose
--   Add a nullable `tipo_id uuid` FK to `family_member_documents` that points
--   at `program_document_types(id)`. The legacy `documento_tipo text NOT NULL`
--   column STAYS in place during the migration window: existing read paths
--   keep working off the slug, and the new tipo_id is populated as defense
--   in depth so the next phase can switch reads + drop documento_tipo.
--
-- Why nullable
--   The Uploads-tab "Pendientes de clasificar" pseudo-state requires rows to
--   exist without an assigned type. Phase 1's PendientesGrid renders an empty
--   state by design until this column is in place; Phase 2 wires the smart-
--   classify flow that pre-populates tipo_id from OCR. Until then, every
--   existing row is back-filled to its current slug's matching tipo row, so
--   tipo_id IS NULL means "explicitly pending" rather than "stale data".
--
-- Backfill safety
--   The UPDATE joins on (programa_id = programa_familias.id AND slug =
--   family_member_documents.documento_tipo). Rows whose slug is not in the
--   programa_familias type registry remain NULL (they shouldn't exist today,
--   but better safe than silently linked to the wrong program).
-- ============================================================================

ALTER TABLE family_member_documents
  ADD COLUMN IF NOT EXISTS tipo_id uuid REFERENCES program_document_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS family_member_documents_tipo_id_idx
  ON family_member_documents(tipo_id)
  WHERE tipo_id IS NOT NULL;

-- Backfill from documento_tipo slug -> program_document_types.id, scoped to
-- the programa_familias program (the only program with a doc-type registry today).
UPDATE family_member_documents fmd
SET tipo_id = pdt.id
FROM program_document_types pdt
JOIN programs p ON p.id = pdt.programa_id AND p.slug = 'programa_familias'
WHERE fmd.documento_tipo = pdt.slug
  AND fmd.tipo_id IS NULL;

-- No RLS changes needed: the existing family_member_documents policies
-- gate by family_id ownership / role, not by tipo_id.
