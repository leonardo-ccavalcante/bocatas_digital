-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260411081843 — name: 20260410120700_create_courses

CREATE TABLE courses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       TEXT NOT NULL,
  tipo         TEXT,
  descripcion  TEXT,
  fecha_inicio DATE,
  fecha_fin    DATE,
  cupo_maximo  INTEGER,
  estado       TEXT DEFAULT 'planificacion'
               CHECK (estado IN ('planificacion', 'inscripcion_abierta', 'en_curso', 'finalizado', 'cancelado')),
  location_id  UUID REFERENCES locations(id),
  formador     TEXT,
  metadata     JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX idx_courses_estado ON courses (estado) WHERE deleted_at IS NULL;
CREATE INDEX idx_courses_location_id ON courses (location_id) WHERE deleted_at IS NULL;

ALTER TABLE program_enrollments
  ADD CONSTRAINT fk_enrollment_course
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT;

CREATE TRIGGER trg_courses_updated_at
  BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
