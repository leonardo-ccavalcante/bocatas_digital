CREATE TABLE locations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL CHECK (char_length(nombre) >= 2 AND char_length(nombre) <= 200),
  tipo        TEXT NOT NULL,      -- 'comedor', 'sede', 'punto_calle', 'almacen'
  direccion   TEXT,
  coordenadas POINT,              -- native PostgreSQL lat/lng
  activo      BOOLEAN NOT NULL DEFAULT true,
  metadata    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX idx_locations_activo ON locations (activo) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_locations_updated_at
  BEFORE UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
