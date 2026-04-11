CREATE TABLE consents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id       UUID NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  purpose         consent_purpose NOT NULL,
  idioma          consent_language NOT NULL,
  granted         BOOLEAN NOT NULL,
  granted_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  consent_text    TEXT NOT NULL,       -- exact text shown (audit trail)
  consent_version TEXT NOT NULL,       -- form version
  firma_url       TEXT,                -- digital signature image in Supabase Storage
  numero_serie_documento TEXT,         -- # de serie del documento físico firmado
  documento_url   TEXT,                -- imagen/scan del documento físico firmado (Supabase Storage)
  ip_address      INET,
  user_agent      TEXT,
  registrado_por  UUID REFERENCES auth.users(id),
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

-- Consent records are IMMUTABLE. Revocation = new record with granted = false. Never UPDATE.

CREATE INDEX idx_consents_person_id ON consents (person_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_consents_person_purpose ON consents (person_id, purpose) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_consents_updated_at
  BEFORE UPDATE ON consents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
