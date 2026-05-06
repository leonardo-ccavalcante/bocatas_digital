-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260411173258 — name: 20260411130060_alter_consents_add_document_fields

ALTER TABLE consents
  ADD COLUMN IF NOT EXISTS documento_foto_url TEXT,
  ADD COLUMN IF NOT EXISTS numero_serie       VARCHAR(50);

COMMENT ON COLUMN consents.documento_foto_url IS
  'URL of the photo of the signed physical consent document. Stored in documentos-consentimiento bucket. Optional.';
COMMENT ON COLUMN consents.numero_serie IS
  'Series number printed on the physical consent form (e.g. BCT-2026-00142). Optional.';
