-- ============================================================================
-- 20260723130003_cierre_sesion_session_documents.sql
--
-- Extends program_document_types.scope to allow 'sesion' value, and creates
-- session_documents table for documents attached to a session close-out.
--
-- RLS: mirrors existing document table patterns — service_role bypasses;
-- admin policies for direct DB access.
--
-- Existence-tolerant: guards undefined_object/undefined_column/undefined_table.
-- ============================================================================

-- ============================================================================
-- 1. UPDATE program_document_types.scope CHECK TO ALLOW 'sesion'
-- ============================================================================

-- Drop existing CHECK constraint and recreate with the new value.
-- Existence-tolerant: handle missing constraint gracefully.

DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'program_document_types_scope_check'
      AND conrelid = 'public.program_document_types'::regclass
  ) THEN
    ALTER TABLE public.program_document_types
      DROP CONSTRAINT program_document_types_scope_check;
  END IF;

  -- Add updated constraint with 'sesion' included
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'program_document_types_scope_check'
      AND conrelid = 'public.program_document_types'::regclass
  ) THEN
    ALTER TABLE public.program_document_types
      ADD CONSTRAINT program_document_types_scope_check
      CHECK (scope IN ('familia', 'miembro', 'sesion'));
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- ============================================================================
-- 2. CREATE session_documents TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.session_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL,
  tipo_slug     text NOT NULL,
  url           text NOT NULL,
  version       integer NOT NULL DEFAULT 1,
  subido_por    text NOT NULL,
  en_nombre_de  text NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- FK constraint (existence-tolerant)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'session_documents_session_id_fkey'
      AND conrelid = 'public.session_documents'::regclass
  ) THEN
    ALTER TABLE public.session_documents
      ADD CONSTRAINT session_documents_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES public.program_sessions(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- ============================================================================
-- 3. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_session_documents_session_id
  ON public.session_documents (session_id);

CREATE INDEX IF NOT EXISTS idx_session_documents_tipo_slug
  ON public.session_documents (tipo_slug);

-- ============================================================================
-- 4. RLS POLICIES
--
-- Pattern mirrors existing document tables (ADR-0002): RLS enabled, but app
-- uses service_role which bypasses. Policies for direct DB access scenarios.
-- ============================================================================

ALTER TABLE public.session_documents ENABLE ROW LEVEL SECURITY;

-- Admin/superadmin: full CRUD
DROP POLICY IF EXISTS session_documents_admin_all ON public.session_documents;
CREATE POLICY session_documents_admin_all ON public.session_documents
  FOR ALL TO authenticated
  USING (public.get_user_role() = ANY (ARRAY['superadmin', 'admin']))
  WITH CHECK (public.get_user_role() = ANY (ARRAY['superadmin', 'admin']));

-- Read: any authenticated user can read session documents
-- (not sensitive PII; attached to sessions, not persons)
DROP POLICY IF EXISTS session_documents_authenticated_select ON public.session_documents;
CREATE POLICY session_documents_authenticated_select ON public.session_documents
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================================
-- 5. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.session_documents IS
  'Documents uploaded as part of session close-out (e.g., plan_clase, listado).';
COMMENT ON COLUMN public.session_documents.session_id IS
  'FK to program_sessions. Cascades on delete.';
COMMENT ON COLUMN public.session_documents.tipo_slug IS
  'Document type slug (matches program_document_types.slug where scope=sesion).';
COMMENT ON COLUMN public.session_documents.url IS
  'Storage path/URL to the document file.';
COMMENT ON COLUMN public.session_documents.version IS
  'Version number for document re-uploads.';
COMMENT ON COLUMN public.session_documents.subido_por IS
  'Who uploaded the document (text per ADR-0011).';
COMMENT ON COLUMN public.session_documents.en_nombre_de IS
  'Who the upload was made on behalf of (text per ADR-0011).';

-- Force PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
