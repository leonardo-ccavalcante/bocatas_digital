-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260411081844 — name: 20260410120800_create_volunteers

CREATE TABLE volunteers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id        UUID NOT NULL REFERENCES persons(id) ON DELETE RESTRICT UNIQUE,
  user_id          UUID REFERENCES auth.users(id),
  fecha_alta       DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_baja       DATE,
  activo           BOOLEAN NOT NULL DEFAULT true,
  seguro_numero    TEXT,
  seguro_caducidad DATE,
  disponibilidad   JSONB DEFAULT '{}'::jsonb,
  habilidades      TEXT[] DEFAULT '{}',
  metadata         JSONB DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX idx_volunteers_person_id ON volunteers (person_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_volunteers_user_id ON volunteers (user_id) WHERE deleted_at IS NULL AND user_id IS NOT NULL;
CREATE INDEX idx_volunteers_activo ON volunteers (activo) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_volunteers_updated_at
  BEFORE UPDATE ON volunteers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
