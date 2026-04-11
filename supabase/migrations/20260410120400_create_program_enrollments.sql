CREATE TABLE program_enrollments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    UUID NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  programa     programa NOT NULL,
  estado       estado_enrollment NOT NULL DEFAULT 'activo',
  course_id    UUID,             -- optional: links to courses table when programa='formacion'
  fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin    DATE,
  notas        TEXT,
  metadata     JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- BUSINESS RULE: one active enrollment per person per program
CREATE UNIQUE INDEX uq_enrollment_person_programa_active
  ON program_enrollments (person_id, programa)
  WHERE estado = 'activo' AND deleted_at IS NULL;

CREATE INDEX idx_enrollments_person_id ON program_enrollments (person_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_enrollments_programa ON program_enrollments (programa) WHERE deleted_at IS NULL;
CREATE INDEX idx_enrollments_estado ON program_enrollments (estado) WHERE deleted_at IS NULL;
CREATE INDEX idx_enrollments_course_id ON program_enrollments (course_id) WHERE deleted_at IS NULL AND course_id IS NOT NULL;

CREATE TRIGGER trg_program_enrollments_updated_at
  BEFORE UPDATE ON program_enrollments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
