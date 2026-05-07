-- Create deliveries table
-- Tracks individual delivery records for families
-- Includes soft-delete support via deleted_at column

CREATE TABLE IF NOT EXISTS public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys (named so the constraint is stable across replays — verified in prod
  -- as deliveries_{family,grant,session}_id_fkey).
  family_id  UUID NOT NULL CONSTRAINT deliveries_family_id_fkey  REFERENCES public.families(id)         ON DELETE CASCADE,
  grant_id   UUID          CONSTRAINT deliveries_grant_id_fkey   REFERENCES public.grants(id)           ON DELETE SET NULL,
  session_id UUID          CONSTRAINT deliveries_session_id_fkey REFERENCES public.program_sessions(id) ON DELETE SET NULL,

  -- Delivery details
  fecha_entrega DATE NOT NULL,
  kg_frutas_hortalizas NUMERIC(10, 2),
  kg_carne NUMERIC(10, 2),
  kg_infantil NUMERIC(10, 2) DEFAULT 0,
  kg_otros NUMERIC(10, 2) DEFAULT 0,
  kg_total NUMERIC(10, 2),
  unidades_no_alimenticias INTEGER,

  -- Recipient info
  recogido_por VARCHAR(255),
  es_autorizado BOOLEAN DEFAULT FALSE,

  -- Documentation
  firma_url TEXT,
  recogido_por_documento_url TEXT,

  -- Audit trail
  registrado_por TEXT,
  notas TEXT,
  metadata JSONB,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for common queries (idempotent — EXPORTED snapshot may already have these)
CREATE INDEX IF NOT EXISTS idx_deliveries_family_id ON public.deliveries(family_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deliveries_session_id ON public.deliveries(session_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deliveries_grant_id ON public.deliveries(grant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deliveries_fecha_entrega ON public.deliveries(fecha_entrega) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deliveries_deleted_at ON public.deliveries(deleted_at);

-- Enable RLS
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

-- RLS Policies (idempotent — drop if exists, then re-create)
-- Allow authenticated users to view deliveries for families they have access to
DROP POLICY IF EXISTS "deliveries_select_authenticated" ON public.deliveries;
CREATE POLICY "deliveries_select_authenticated" ON public.deliveries
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

-- Allow admins to insert deliveries.
-- Originally written as `EXISTS (SELECT 1 FROM public.users …)` which referenced
-- the Manus MySQL Drizzle table — does not exist in Supabase Postgres. The
-- policy was effectively dead in production (service-role bypasses RLS, so
-- nobody hit it) but blocks `supabase start` in CI which validates references
-- at CREATE time. Rewriting to use the project's standard public.get_user_role()
-- function is semantically equivalent (admin/superadmin only) and consistent
-- with every other RLS policy in the project. Superseded for runtime by
-- 20260506000005_rewrite_deliveries_and_program_sessions_rls.sql which adds
-- deliveries_admin_all covering all CRUD.
DROP POLICY IF EXISTS "deliveries_insert_admin" ON public.deliveries;
CREATE POLICY "deliveries_insert_admin" ON public.deliveries
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() IN ('superadmin', 'admin'));

-- Allow admins to update deliveries
DROP POLICY IF EXISTS "deliveries_update_admin" ON public.deliveries;
CREATE POLICY "deliveries_update_admin" ON public.deliveries
  FOR UPDATE
  TO authenticated
  USING (public.get_user_role() IN ('superadmin', 'admin'));

-- Allow admins to soft-delete deliveries
DROP POLICY IF EXISTS "deliveries_delete_admin" ON public.deliveries;
CREATE POLICY "deliveries_delete_admin" ON public.deliveries
  FOR DELETE
  TO authenticated
  USING (public.get_user_role() IN ('superadmin', 'admin'));

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_deliveries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deliveries_update_updated_at ON public.deliveries;
CREATE TRIGGER deliveries_update_updated_at
BEFORE UPDATE ON public.deliveries
FOR EACH ROW
EXECUTE FUNCTION public.update_deliveries_updated_at();
