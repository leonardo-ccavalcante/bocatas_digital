-- INFORMES SOCIALES enrichment — schema prerequisites.
--
-- (1) Family-level social-report NARRATIVE columns. The INFORMES sheet carries
--     DESCRIPCIÓN SITUACIÓN FAMILIAR + NOTAS NECESIDADES; today families.informe_social
--     is only a BOOLEAN flag, so the text had no home. These are almost certainly
--     GDPR Art. 9 special-category data → admin/superadmin only (added to
--     redactHighRiskFields). The EIPD addendum covering this processing is a
--     go-live gate (not applied to prod until signed).
-- (2) Extend the import-audit operation CHECK with the enrichment operations the
--     enrich_families_from_informes RPC records.

ALTER TABLE families
  ADD COLUMN IF NOT EXISTS situacion_familiar_texto text,
  ADD COLUMN IF NOT EXISTS necesidades_texto        text;

COMMENT ON COLUMN families.situacion_familiar_texto IS
  'Social-report narrative (INFORMES SOCIALES, DESCRIPCIÓN SITUACIÓN FAMILIAR). GDPR Art.9 — admin/superadmin only via redactHighRiskFields.';
COMMENT ON COLUMN families.necesidades_texto IS
  'Social-report needs narrative (INFORMES SOCIALES, NOTAS NECESIDADES). GDPR Art.9 — admin/superadmin only.';

ALTER TABLE family_legacy_import_audit
  DROP CONSTRAINT IF EXISTS family_legacy_import_audit_operation_check;
ALTER TABLE family_legacy_import_audit
  ADD CONSTRAINT family_legacy_import_audit_operation_check
  CHECK (operation IN ('created', 'skipped_duplicate', 'failed', 'enriched', 'skipped_missing'));
