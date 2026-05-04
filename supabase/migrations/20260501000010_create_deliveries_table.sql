-- Create deliveries table
-- Tracks individual delivery records for families
-- Includes soft-delete support via deleted_at column

CREATE TABLE IF NOT EXISTS public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  grant_id UUID REFERENCES public.grants(id) ON DELETE SET NULL,
  session_id UUID REFERENCES public.program_sessions(id) ON DELETE SET NULL,
  
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
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT deliveries_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE,
  CONSTRAINT deliveries_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.grants(id) ON DELETE SET NULL,
  CONSTRAINT deliveries_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.program_sessions(id) ON DELETE SET NULL
);

-- Create indexes for common queries
CREATE INDEX idx_deliveries_family_id ON public.deliveries(family_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deliveries_session_id ON public.deliveries(session_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deliveries_grant_id ON public.deliveries(grant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deliveries_fecha_entrega ON public.deliveries(fecha_entrega) WHERE deleted_at IS NULL;
CREATE INDEX idx_deliveries_deleted_at ON public.deliveries(deleted_at);

-- Enable RLS
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Allow authenticated users to view deliveries for families they have access to
CREATE POLICY "deliveries_select_authenticated" ON public.deliveries
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

-- Allow admins to insert deliveries
CREATE POLICY "deliveries_insert_admin" ON public.deliveries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()::text
      AND users.role IN ('admin', 'superadmin')
    )
  );

-- Allow admins to update deliveries
CREATE POLICY "deliveries_update_admin" ON public.deliveries
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()::text
      AND users.role IN ('admin', 'superadmin')
    )
  );

-- Allow admins to soft-delete deliveries
CREATE POLICY "deliveries_delete_admin" ON public.deliveries
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()::text
      AND users.role IN ('admin', 'superadmin')
    )
  );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_deliveries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deliveries_update_updated_at
BEFORE UPDATE ON public.deliveries
FOR EACH ROW
EXECUTE FUNCTION public.update_deliveries_updated_at();
