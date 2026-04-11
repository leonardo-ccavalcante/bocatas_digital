-- Migration: Setup program_enrollments FK, RLS, trigram indexes
-- Task 2 Epic A: programs catalog CRUD + dynamic enrollment
-- Note: program_id UUID column already exists from Task 1 migration

-- Step 1: Add FK constraint if not already present
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

-- Step 2: Add unique constraint (one enrollment per person per program)
ALTER TABLE program_enrollments
  DROP CONSTRAINT IF EXISTS uq_enrollment_person_program;

ALTER TABLE program_enrollments
  ADD CONSTRAINT uq_enrollment_person_program
  UNIQUE (person_id, program_id);

-- Step 3: RLS for program_enrollments
ALTER TABLE program_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "enrollment_select_own_role" ON program_enrollments;
CREATE POLICY "enrollment_select_own_role" ON program_enrollments
  FOR SELECT USING (
    (auth.jwt() ->> 'role') IN ('admin', 'superadmin', 'voluntario')
  );

DROP POLICY IF EXISTS "enrollment_insert_voluntario" ON program_enrollments;
CREATE POLICY "enrollment_insert_voluntario" ON program_enrollments
  FOR INSERT WITH CHECK (
    (auth.jwt() ->> 'role') IN ('admin', 'superadmin', 'voluntario')
  );

DROP POLICY IF EXISTS "enrollment_update_admin" ON program_enrollments;
CREATE POLICY "enrollment_update_admin" ON program_enrollments
  FOR UPDATE USING (
    (auth.jwt() ->> 'role') IN ('admin', 'superadmin')
  );

-- Step 4: RLS for programs table
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "programs_select_authenticated" ON programs;
CREATE POLICY "programs_select_authenticated" ON programs
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "programs_write_superadmin" ON programs;
CREATE POLICY "programs_write_superadmin" ON programs
  FOR ALL USING (
    (auth.jwt() ->> 'role') = 'superadmin'
  );

-- Step 5: RLS for consent_templates
ALTER TABLE consent_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consent_templates_select_authenticated" ON consent_templates;
CREATE POLICY "consent_templates_select_authenticated" ON consent_templates
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "consent_templates_write_superadmin" ON consent_templates;
CREATE POLICY "consent_templates_write_superadmin" ON consent_templates
  FOR ALL USING (
    (auth.jwt() ->> 'role') = 'superadmin'
  );

-- Step 6: Trigram indexes for duplicate detection (< 2s query requirement)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP INDEX IF EXISTS idx_persons_nombre_trgm;
CREATE INDEX idx_persons_nombre_trgm
  ON persons USING GIN (nombre gin_trgm_ops);

DROP INDEX IF EXISTS idx_persons_apellidos_trgm;
CREATE INDEX idx_persons_apellidos_trgm
  ON persons USING GIN (apellidos gin_trgm_ops);

DROP INDEX IF EXISTS idx_persons_fullname_trgm;
CREATE INDEX idx_persons_fullname_trgm
  ON persons USING GIN ((nombre || ' ' || apellidos) gin_trgm_ops);
