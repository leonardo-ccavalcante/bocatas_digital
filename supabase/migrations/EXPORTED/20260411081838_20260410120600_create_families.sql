-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260411081838 — name: 20260410120600_create_families

CREATE SEQUENCE familia_numero_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE families (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_numero           INTEGER NOT NULL DEFAULT nextval('familia_numero_seq') UNIQUE,
  titular_id               UUID REFERENCES persons(id) ON DELETE RESTRICT,
  fecha_alta               DATE NOT NULL DEFAULT CURRENT_DATE,
  estado                   TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'baja')),
  fecha_baja               DATE,
  motivo_baja              motivo_baja_familia,

  miembros                 JSONB DEFAULT '[]'::jsonb,
  num_miembros             INTEGER DEFAULT 1,
  num_adultos              INTEGER DEFAULT 1,
  num_menores_18           INTEGER DEFAULT 0,

  persona_recoge           TEXT,
  autorizado               BOOLEAN DEFAULT false,

  alta_en_guf              BOOLEAN DEFAULT false,
  fecha_alta_guf           DATE,
  fecha_baja_guf           DATE,

  consent_bocatas          BOOLEAN DEFAULT false,
  consent_banco_alimentos  BOOLEAN DEFAULT false,
  docs_identidad           BOOLEAN DEFAULT false,
  padron_recibido          BOOLEAN DEFAULT false,
  justificante_recibido    BOOLEAN DEFAULT false,
  informe_social           BOOLEAN DEFAULT false,
  informe_social_fecha     DATE,

  metadata                 JSONB DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at               TIMESTAMPTZ
);

ALTER SEQUENCE familia_numero_seq OWNED BY families.familia_numero;

CREATE INDEX idx_families_titular_id ON families (titular_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_families_familia_numero ON families (familia_numero) WHERE deleted_at IS NULL;
CREATE INDEX idx_families_estado ON families (estado) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_families_updated_at
  BEFORE UPDATE ON families FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
