CREATE TABLE grants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL,
  financiador TEXT NOT NULL,
  importe     NUMERIC(12,2),
  fecha_inicio DATE,
  fecha_fin   DATE,
  estado      TEXT DEFAULT 'solicitada'
              CHECK (estado IN ('solicitada', 'aprobada', 'en_curso', 'justificada', 'cerrada', 'rechazada')),

  -- GRANT → PROJECT ALLOCATION
  -- Tracks how this grant's resources are distributed across programs/projects.
  -- Example: [{"programa":"comedor","importe_asignado":20000},{"programa":"familia","importe_asignado":15000}]
  -- Actual spending is tracked via deliveries.grant_id (for familia) and future tables.
  programas_financiados JSONB DEFAULT '[]'::jsonb,

  metadata    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE TRIGGER trg_grants_updated_at
  BEFORE UPDATE ON grants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
