CREATE TABLE deliveries (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id                UUID NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
  grant_id                 UUID REFERENCES grants(id),       -- FK to grants for IRPF justification
  fecha_entrega            DATE NOT NULL DEFAULT CURRENT_DATE,

  -- KG TRACKING per category (Sole's signature sheets)
  kg_frutas_hortalizas     NUMERIC(6,2) DEFAULT 0,
  kg_carne                 NUMERIC(6,2) DEFAULT 0,
  kg_infantil              NUMERIC(6,2) DEFAULT 0,
  kg_otros                 NUMERIC(6,2) DEFAULT 0,
  kg_total                 NUMERIC(6,2) DEFAULT 0,           -- app computes sum on insert
  unidades_no_alimenticias INTEGER DEFAULT 0,

  -- PICKUP TRACKING
  recogido_por             TEXT,                              -- name of person who picked up
  es_autorizado            BOOLEAN NOT NULL DEFAULT false,    -- proxy pickup
  firma_url                TEXT,                              -- signature image in Supabase Storage

  -- TRACKING
  registrado_por           UUID REFERENCES auth.users(id),
  notas                    TEXT,
  metadata                 JSONB DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at               TIMESTAMPTZ
);

-- COMPLIANCE: query deliveries by month for IRPF audit
CREATE INDEX idx_deliveries_family_id ON deliveries (family_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deliveries_fecha_entrega ON deliveries (fecha_entrega) WHERE deleted_at IS NULL;
CREATE INDEX idx_deliveries_grant_id ON deliveries (grant_id) WHERE deleted_at IS NULL AND grant_id IS NOT NULL;

-- AUDIT: aggregate queries — total kg per month, per financier
CREATE INDEX idx_deliveries_date_grant ON deliveries (fecha_entrega, grant_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_deliveries_updated_at
  BEFORE UPDATE ON deliveries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
