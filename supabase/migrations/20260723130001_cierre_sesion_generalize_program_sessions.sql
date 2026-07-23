-- ============================================================================
-- 20260723130001_cierre_sesion_generalize_program_sessions.sql
--
-- Wave 1 schema for "cierre de sesión" feature. Generalizes program_sessions
-- for multi-program use: session states, time tracking, responsible person,
-- enlace mágico (magic link) tokens, and cancellation support.
--
-- Existence-tolerant: guards undefined_object/undefined_column/undefined_table
-- via DO blocks and IF NOT EXISTS patterns.
-- ============================================================================

-- ============================================================================
-- 1. ADD NEW COLUMNS TO program_sessions (existence-tolerant)
-- ============================================================================

DO $$
BEGIN
  -- estado: session lifecycle state
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'program_sessions' AND column_name = 'estado'
  ) THEN
    ALTER TABLE public.program_sessions
      ADD COLUMN estado text NOT NULL DEFAULT 'cerrada';
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  -- hora_inicio: session start time (within the day)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'program_sessions' AND column_name = 'hora_inicio'
  ) THEN
    ALTER TABLE public.program_sessions
      ADD COLUMN hora_inicio time NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  -- hora_fin: session end time (within the day)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'program_sessions' AND column_name = 'hora_fin'
  ) THEN
    ALTER TABLE public.program_sessions
      ADD COLUMN hora_fin time NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  -- responsable_nombre: name of responsible person (text, per ADR-0011)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'program_sessions' AND column_name = 'responsable_nombre'
  ) THEN
    ALTER TABLE public.program_sessions
      ADD COLUMN responsable_nombre text NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  -- responsable_person_id: FK to persons for responsible (optional link)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'program_sessions' AND column_name = 'responsable_person_id'
  ) THEN
    ALTER TABLE public.program_sessions
      ADD COLUMN responsable_person_id uuid NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  -- motivo_cancelacion: reason for cancelled sessions
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'program_sessions' AND column_name = 'motivo_cancelacion'
  ) THEN
    ALTER TABLE public.program_sessions
      ADD COLUMN motivo_cancelacion text NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  -- en_nombre_de: who closed/actioned the session on behalf of (text, ADR-0011)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'program_sessions' AND column_name = 'en_nombre_de'
  ) THEN
    ALTER TABLE public.program_sessions
      ADD COLUMN en_nombre_de text NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  -- enlace_token_hash: hashed magic-link token for profesor close flow
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'program_sessions' AND column_name = 'enlace_token_hash'
  ) THEN
    ALTER TABLE public.program_sessions
      ADD COLUMN enlace_token_hash text NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  -- enlace_expira: expiry timestamp for magic-link token
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'program_sessions' AND column_name = 'enlace_expira'
  ) THEN
    ALTER TABLE public.program_sessions
      ADD COLUMN enlace_expira timestamptz NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- ============================================================================
-- 2. ADD CONSTRAINTS (existence-tolerant)
-- ============================================================================

-- CHECK constraint for estado values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'program_sessions_estado_check' AND conrelid = 'public.program_sessions'::regclass
  ) THEN
    ALTER TABLE public.program_sessions
      ADD CONSTRAINT program_sessions_estado_check
      CHECK (estado IN ('planificada', 'abierta', 'cerrada', 'cancelada'));
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- FK constraint for responsable_person_id -> persons(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'program_sessions_responsable_person_id_fkey'
      AND conrelid = 'public.program_sessions'::regclass
  ) THEN
    ALTER TABLE public.program_sessions
      ADD CONSTRAINT program_sessions_responsable_person_id_fkey
      FOREIGN KEY (responsable_person_id) REFERENCES public.persons(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- ============================================================================
-- 3. ADD INDEXES (existence-tolerant via IF NOT EXISTS)
-- ============================================================================

-- Index on estado for filtering by state
CREATE INDEX IF NOT EXISTS idx_program_sessions_estado
  ON public.program_sessions (estado);

-- Index on enlace_token_hash for magic-link lookups (partial, only non-null)
CREATE INDEX IF NOT EXISTS idx_program_sessions_enlace_token_hash
  ON public.program_sessions (enlace_token_hash)
  WHERE enlace_token_hash IS NOT NULL;

-- Index on responsable_person_id (partial, only non-null)
CREATE INDEX IF NOT EXISTS idx_program_sessions_responsable_person_id
  ON public.program_sessions (responsable_person_id)
  WHERE responsable_person_id IS NOT NULL;

-- ============================================================================
-- 4. PRESERVE EXISTING PARTIAL UNIQUE INDEX
-- The existing uq_program_sessions_open enforces uniqueness per
-- (program_id, fecha, location_id) WHERE closed_at IS NULL.
--
-- IMPORTANT: PostgreSQL treats NULL != NULL in unique indexes, so when
-- location_id is NULL (no location pre-set), multiple open sessions for
-- the same program+fecha can coexist — the constraint does NOT enforce
-- uniqueness for NULL locations. Always populate location_id (via
-- generarSesiones config.location_id or abrirSesion locationId input)
-- to get full uniqueness enforcement per (program, date, location).
-- ============================================================================

-- Note: uq_program_sessions_open already exists from 20260413121654 migration
-- We do NOT touch it here.

-- ============================================================================
-- 5. COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.program_sessions.estado IS
  'Session lifecycle: planificada (scheduled), abierta (active), cerrada (closed), cancelada.';
COMMENT ON COLUMN public.program_sessions.hora_inicio IS
  'Start time within the day (time without timezone).';
COMMENT ON COLUMN public.program_sessions.hora_fin IS
  'End time within the day (time without timezone).';
COMMENT ON COLUMN public.program_sessions.responsable_nombre IS
  'Name of responsible person (text per ADR-0011).';
COMMENT ON COLUMN public.program_sessions.responsable_person_id IS
  'FK to persons for responsible person (optional structured link).';
COMMENT ON COLUMN public.program_sessions.motivo_cancelacion IS
  'Reason for cancellation (required when estado=cancelada).';
COMMENT ON COLUMN public.program_sessions.en_nombre_de IS
  'Who performed the close action on behalf of (text per ADR-0011).';
COMMENT ON COLUMN public.program_sessions.enlace_token_hash IS
  'SHA-256 hash of magic-link token for profesor close flow.';
COMMENT ON COLUMN public.program_sessions.enlace_expira IS
  'Expiry timestamp for the magic-link token.';

-- Force PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
