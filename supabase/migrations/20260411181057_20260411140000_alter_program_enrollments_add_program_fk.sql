-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260411181057 — name: 20260411140000_alter_program_enrollments_add_program_fk
-- NOTE: This migration was applied TWICE in prod (versions 20260411180425 and 20260411181057). Latest content shown.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'program_enrollments_program_id_fkey'
      AND table_name = 'program_enrollments'
  ) THEN
    ALTER TABLE program_enrollments
      ADD CONSTRAINT program_enrollments_program_id_fkey
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE program_enrollments DROP CONSTRAINT IF EXISTS uq_enrollment_person_program;
ALTER TABLE program_enrollments
  ADD CONSTRAINT uq_enrollment_person_program
  UNIQUE (person_id, program_id);

ALTER TABLE program_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "enrollment_select_own_role" ON program_enrollments;
CREATE POLICY "enrollment_select_own_role" ON program_enrollments
  FOR SELECT USING ((auth.jwt() ->> 'role') IN ('admin', 'superadmin', 'voluntario'));

DROP POLICY IF EXISTS "enrollment_insert_voluntario" ON program_enrollments;
CREATE POLICY "enrollment_insert_voluntario" ON program_enrollments
  FOR INSERT WITH CHECK ((auth.jwt() ->> 'role') IN ('admin', 'superadmin', 'voluntario'));

DROP POLICY IF EXISTS "enrollment_update_admin" ON program_enrollments;
CREATE POLICY "enrollment_update_admin" ON program_enrollments
  FOR UPDATE USING ((auth.jwt() ->> 'role') IN ('admin', 'superadmin'));

ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "programs_select_authenticated" ON programs;
CREATE POLICY "programs_select_authenticated" ON programs
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "programs_write_superadmin" ON programs;
CREATE POLICY "programs_write_superadmin" ON programs
  FOR ALL USING ((auth.jwt() ->> 'role') = 'superadmin');

ALTER TABLE consent_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consent_templates_select_authenticated" ON consent_templates;
CREATE POLICY "consent_templates_select_authenticated" ON consent_templates
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "consent_templates_write_superadmin" ON consent_templates;
CREATE POLICY "consent_templates_write_superadmin" ON consent_templates
  FOR ALL USING ((auth.jwt() ->> 'role') = 'superadmin');

CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP INDEX IF EXISTS idx_persons_nombre_trgm;
CREATE INDEX idx_persons_nombre_trgm ON persons USING GIN (nombre gin_trgm_ops);

DROP INDEX IF EXISTS idx_persons_apellidos_trgm;
CREATE INDEX idx_persons_apellidos_trgm ON persons USING GIN (apellidos gin_trgm_ops);

DROP INDEX IF EXISTS idx_persons_fullname_trgm;
CREATE INDEX idx_persons_fullname_trgm ON persons USING GIN ((nombre || ' ' || apellidos) gin_trgm_ops);
