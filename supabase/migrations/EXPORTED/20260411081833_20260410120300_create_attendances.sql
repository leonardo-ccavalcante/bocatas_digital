-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260411081833 — name: 20260410120300_create_attendances

CREATE TABLE attendances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id       UUID REFERENCES persons(id) ON DELETE RESTRICT,
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  programa        programa,
  checked_in_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_in_date DATE NOT NULL DEFAULT CURRENT_DATE,
  metodo          metodo_checkin NOT NULL,
  registrado_por  UUID REFERENCES auth.users(id),
  es_demo         BOOLEAN NOT NULL DEFAULT false,
  notas           TEXT,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_attendance_person_location_programa_date
  ON attendances (person_id, location_id, programa, checked_in_date)
  WHERE person_id IS NOT NULL AND programa IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_attendances_person_id ON attendances (person_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_attendances_location_id ON attendances (location_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_attendances_checked_in_date ON attendances (checked_in_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_attendances_registrado_por ON attendances (registrado_por) WHERE deleted_at IS NULL;
CREATE INDEX idx_attendances_programa ON attendances (programa) WHERE deleted_at IS NULL AND programa IS NOT NULL;

CREATE INDEX idx_attendances_date_location ON attendances (checked_in_date, location_id)
  WHERE deleted_at IS NULL AND es_demo = false;

CREATE INDEX idx_attendances_date_programa ON attendances (checked_in_date, programa)
  WHERE deleted_at IS NULL AND es_demo = false;

CREATE TRIGGER trg_attendances_updated_at
  BEFORE UPDATE ON attendances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
