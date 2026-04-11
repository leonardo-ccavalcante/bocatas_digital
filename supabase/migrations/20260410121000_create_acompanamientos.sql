CREATE TABLE acompanamientos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   UUID NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  tipo        TEXT CHECK (tipo IN ('juridico', 'social', 'laboral', 'vivienda')),
  estado      TEXT DEFAULT 'abierto'
              CHECK (estado IN ('abierto', 'en_curso', 'cerrado', 'derivado')),
  asignado_a  UUID REFERENCES auth.users(id),   -- staff member leading this case
  entidad_derivacion TEXT,                       -- if derivado: which external entity
  descripcion TEXT,
  metadata    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX idx_acompanamientos_person_id ON acompanamientos (person_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_acompanamientos_asignado_a ON acompanamientos (asignado_a) WHERE deleted_at IS NULL AND asignado_a IS NOT NULL;

CREATE TRIGGER trg_acompanamientos_updated_at
  BEFORE UPDATE ON acompanamientos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
