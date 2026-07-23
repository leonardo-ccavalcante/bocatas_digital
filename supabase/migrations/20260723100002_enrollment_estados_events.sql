-- 20260723100002_enrollment_estados_events.sql
--
-- Wave 1 schema: extend estado_enrollment enum and create enrollment_events
-- append-only audit table.
--
-- CRITICAL: ALTER TYPE ... ADD VALUE cannot be used in the same transaction
-- as any reference to the new values. Each ADD VALUE is wrapped tolerantly
-- and we do NOT reference the new enum values anywhere in this migration.
--
-- Existence-tolerant: guards undefined_object/undefined_column/undefined_table.

-- ============================================================================
-- 1. EXTEND estado_enrollment ENUM (tolerant, one value at a time)
-- ============================================================================

-- 'inscrito' - newly enrolled, pending confirmation
DO $$
BEGIN
  ALTER TYPE public.estado_enrollment ADD VALUE IF NOT EXISTS 'inscrito';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- 'preseleccionado' - pre-selected for admission
DO $$
BEGIN
  ALTER TYPE public.estado_enrollment ADD VALUE IF NOT EXISTS 'preseleccionado';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- 'admitido' - formally admitted
DO $$
BEGIN
  ALTER TYPE public.estado_enrollment ADD VALUE IF NOT EXISTS 'admitido';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- 'lista_espera' - waiting list
DO $$
BEGIN
  ALTER TYPE public.estado_enrollment ADD VALUE IF NOT EXISTS 'lista_espera';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- 'baja' - withdrawn/dropped out
DO $$
BEGIN
  ALTER TYPE public.estado_enrollment ADD VALUE IF NOT EXISTS 'baja';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- 'terminado' - finished (program ended or person completed)
DO $$
BEGIN
  ALTER TYPE public.estado_enrollment ADD VALUE IF NOT EXISTS 'terminado';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- ============================================================================
-- 2. ADD motivo_baja COLUMN TO program_enrollments (existence-tolerant)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'program_enrollments' AND column_name = 'motivo_baja'
  ) THEN
    ALTER TABLE public.program_enrollments
      ADD COLUMN motivo_baja text NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

COMMENT ON COLUMN public.program_enrollments.motivo_baja IS 'Reason for withdrawal (baja). Free text.';

-- ============================================================================
-- 3. CREATE enrollment_events TABLE (append-only audit log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.enrollment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.program_enrollments(id) ON DELETE CASCADE,
  estado_anterior text NULL,
  estado_nuevo text NOT NULL,
  motivo text NULL,
  actor text NULL,  -- TEXT per ADR-0011: holds String(ctx.user.id), no FK to auth.users
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient queries by enrollment + time
CREATE INDEX IF NOT EXISTS idx_enrollment_events_enrollment_created
  ON public.enrollment_events (enrollment_id, created_at);

COMMENT ON TABLE public.enrollment_events IS 'Append-only audit log for enrollment state transitions.';
COMMENT ON COLUMN public.enrollment_events.enrollment_id IS 'FK to program_enrollments.id. CASCADE on delete.';
COMMENT ON COLUMN public.enrollment_events.estado_anterior IS 'Previous state (text, not enum). NULL for initial enrollment.';
COMMENT ON COLUMN public.enrollment_events.estado_nuevo IS 'New state (text, not enum).';
COMMENT ON COLUMN public.enrollment_events.motivo IS 'Reason for the state change.';
COMMENT ON COLUMN public.enrollment_events.actor IS 'User ID who made the change (text, per ADR-0011).';
COMMENT ON COLUMN public.enrollment_events.created_at IS 'Timestamp of the state change.';

-- ============================================================================
-- 4. ENABLE RLS AND MIRROR program_enrollments POSTURE
-- ============================================================================

-- program_enrollments has RLS enabled (20260411082019) with these policies:
--   - enrollments_superadmin_all: FOR ALL where role='superadmin'
--   - enrollments_admin_all: FOR ALL where role='admin'
--   - enrollments_voluntario_select: FOR SELECT where role='voluntario' AND deleted_at IS NULL
--   - enrollments_beneficiario_select: FOR SELECT where person_id=get_person_id() AND deleted_at IS NULL
--   - enrollments_voluntario_insert: FOR INSERT where role='voluntario' (from 20260411173300)
--
-- enrollment_events mirrors this posture, but as append-only (no UPDATE/DELETE policies
-- for non-superadmin/admin roles). Since it's CASCADE on enrollment delete, the parent
-- row protection suffices.

ALTER TABLE public.enrollment_events ENABLE ROW LEVEL SECURITY;

-- Superadmin: full access
DROP POLICY IF EXISTS enrollment_events_superadmin_all ON public.enrollment_events;
CREATE POLICY enrollment_events_superadmin_all ON public.enrollment_events
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'superadmin')
  WITH CHECK (public.get_user_role() = 'superadmin');

-- Admin: full access
DROP POLICY IF EXISTS enrollment_events_admin_all ON public.enrollment_events;
CREATE POLICY enrollment_events_admin_all ON public.enrollment_events
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

-- Voluntario: SELECT only (can view event history for enrollments they can see)
DROP POLICY IF EXISTS enrollment_events_voluntario_select ON public.enrollment_events;
CREATE POLICY enrollment_events_voluntario_select ON public.enrollment_events
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() = 'voluntario'
    AND EXISTS (
      SELECT 1 FROM public.program_enrollments pe
      WHERE pe.id = enrollment_events.enrollment_id AND pe.deleted_at IS NULL
    )
  );

-- Voluntario: INSERT (can record state changes)
DROP POLICY IF EXISTS enrollment_events_voluntario_insert ON public.enrollment_events;
CREATE POLICY enrollment_events_voluntario_insert ON public.enrollment_events
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() = 'voluntario');

-- Beneficiario: SELECT own enrollment events only
DROP POLICY IF EXISTS enrollment_events_beneficiario_select ON public.enrollment_events;
CREATE POLICY enrollment_events_beneficiario_select ON public.enrollment_events
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() = 'beneficiario'
    AND EXISTS (
      SELECT 1 FROM public.program_enrollments pe
      WHERE pe.id = enrollment_events.enrollment_id
        AND pe.person_id = public.get_person_id()
        AND pe.deleted_at IS NULL
    )
  );

-- ============================================================================
-- 5. GRANTS (mirror 20260612000002_recover_role_table_grants.sql posture)
-- ============================================================================

-- The ALTER DEFAULT PRIVILEGES in 20260612000002 covers new tables automatically,
-- but we explicitly grant to be safe and visible.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrollment_events
  TO anon, authenticated, service_role;
