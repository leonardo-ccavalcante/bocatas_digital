-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260411081841 — name: 20260410120660_create_deliveries

CREATE TABLE deliveries (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id                UUID NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
  grant_id                 UUID REFERENCES grants(id),
  fecha_entrega            DATE NOT NULL DEFAULT CURRENT_DATE,

  kg_frutas_hortalizas     NUMERIC(6,2) DEFAULT 0,
  kg_carne                 NUMERIC(6,2) DEFAULT 0,
  kg_infantil              NUMERIC(6,2) DEFAULT 0,
  kg_otros                 NUMERIC(6,2) DEFAULT 0,
  kg_total                 NUMERIC(6,2) DEFAULT 0,
  unidades_no_alimenticias INTEGER DEFAULT 0,

  recogido_por             TEXT,
  es_autorizado            BOOLEAN NOT NULL DEFAULT false,
  firma_url                TEXT,

  registrado_por           UUID REFERENCES auth.users(id),
  notas                    TEXT,
  metadata                 JSONB DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at               TIMESTAMPTZ
);

CREATE INDEX idx_deliveries_family_id ON deliveries (family_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deliveries_fecha_entrega ON deliveries (fecha_entrega) WHERE deleted_at IS NULL;
CREATE INDEX idx_deliveries_grant_id ON deliveries (grant_id) WHERE deleted_at IS NULL AND grant_id IS NOT NULL;

CREATE INDEX idx_deliveries_date_grant ON deliveries (fecha_entrega, grant_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_deliveries_updated_at
  BEFORE UPDATE ON deliveries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
