-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260411173300 — name: 20260411130100_create_programs

CREATE TABLE public.programs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            VARCHAR(50) NOT NULL UNIQUE,
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  icon            VARCHAR(50) DEFAULT '📋',
  is_default      BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  display_order   SMALLINT NOT NULL DEFAULT 0,
  requires_fields JSONB DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_programs_active ON programs (is_active, display_order) WHERE is_active = true;

CREATE TRIGGER trg_programs_updated_at
  BEFORE UPDATE ON programs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select" ON programs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "superadmin_write" ON programs
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin');

INSERT INTO programs (slug, name, icon, is_default, display_order) VALUES
  ('comedor',           'Comedor Social',     '🍽️', true,  1),
  ('familia',           'Programa Familias',  '📦', false, 2),
  ('formacion',         'Formación',          '📚', false, 3),
  ('atencion_juridica', 'Atención Jurídica',  '⚖️', false, 4),
  ('voluntariado',      'Voluntariado',       '🤝', false, 5),
  ('acompanamiento',    'Acompañamiento',     '🫂', false, 6);

ALTER TABLE program_enrollments ADD COLUMN program_id UUID;

UPDATE program_enrollments pe
  SET program_id = p.id
  FROM programs p
  WHERE pe.programa::text = p.slug;

ALTER TABLE program_enrollments
  ALTER COLUMN program_id SET NOT NULL,
  ADD CONSTRAINT fk_enrollment_program FOREIGN KEY (program_id) REFERENCES programs(id);

ALTER TABLE program_enrollments DROP COLUMN programa;

DROP INDEX IF EXISTS uq_enrollment_person_programa_active;
CREATE UNIQUE INDEX uq_enrollment_person_program_active
  ON program_enrollments (person_id, program_id)
  WHERE estado = 'activo' AND deleted_at IS NULL;

DROP INDEX IF EXISTS idx_enrollments_programa;
CREATE INDEX idx_enrollments_program_id ON program_enrollments (program_id) WHERE deleted_at IS NULL;

CREATE POLICY enrollments_voluntario_insert ON program_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() = 'voluntario');
