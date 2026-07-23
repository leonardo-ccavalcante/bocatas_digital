-- ============================================================================
-- 20260723130002_cierre_sesion_attendances_session_id.sql
--
-- Links attendances to program_sessions via session_id FK. Does NOT alter the
-- existing day-key constraint (uq_attendance_person_location_programa_date).
--
-- Existence-tolerant: guards undefined_object/undefined_column/undefined_table.
-- ============================================================================

-- ============================================================================
-- 1. ADD session_id COLUMN TO attendances (existence-tolerant)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attendances' AND column_name = 'session_id'
  ) THEN
    ALTER TABLE public.attendances
      ADD COLUMN session_id uuid NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- ============================================================================
-- 2. ADD FK CONSTRAINT (existence-tolerant)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendances_session_id_fkey'
      AND conrelid = 'public.attendances'::regclass
  ) THEN
    ALTER TABLE public.attendances
      ADD CONSTRAINT attendances_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES public.program_sessions(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- ============================================================================
-- 3. ADD INDEX ON session_id (existence-tolerant via IF NOT EXISTS)
-- ============================================================================

-- Partial index for efficient lookups of attendances linked to sessions
CREATE INDEX IF NOT EXISTS idx_attendances_session_id
  ON public.attendances (session_id)
  WHERE session_id IS NOT NULL;

-- ============================================================================
-- 4. COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.attendances.session_id IS
  'FK to program_sessions for attendance within a structured session. NULL = legacy or non-session attendance.';

-- Force PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
