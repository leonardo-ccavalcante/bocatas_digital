-- Migration 19c: add physical consent document fields to consents table
-- Both fields are optional — existing consent flows are unaffected.

ALTER TABLE consents
  ADD COLUMN IF NOT EXISTS documento_foto_url TEXT,
  ADD COLUMN IF NOT EXISTS numero_serie       VARCHAR(50);

COMMENT ON COLUMN consents.documento_foto_url IS
  'URL of the photo of the signed physical consent document. Stored in documentos-consentimiento bucket. Optional — digital-only consent is valid.';
COMMENT ON COLUMN consents.numero_serie IS
  'Series number printed on the physical consent form (e.g. BCT-2026-00142). Optional.';
