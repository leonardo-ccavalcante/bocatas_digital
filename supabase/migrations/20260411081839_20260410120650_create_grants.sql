-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260411081839 — name: 20260410120650_create_grants

CREATE TABLE grants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL,
  financiador TEXT NOT NULL,
  importe     NUMERIC(12,2),
  fecha_inicio DATE,
  fecha_fin   DATE,
  estado      TEXT DEFAULT 'solicitada'
              CHECK (estado IN ('solicitada', 'aprobada', 'en_curso', 'justificada', 'cerrada', 'rechazada')),

  programas_financiados JSONB DEFAULT '[]'::jsonb,

  metadata    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE TRIGGER trg_grants_updated_at
  BEFORE UPDATE ON grants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
