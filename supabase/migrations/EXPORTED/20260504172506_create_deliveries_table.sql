-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260504172506 — name: create_deliveries_table
-- NOTE: This is the v2 deliveries table that supersedes the original 20260411081841 create_deliveries.
-- Drops the old structure and creates a fresh one with session_id FK + new columns.

CREATE TABLE IF NOT EXISTS public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  grant_id UUID REFERENCES public.grants(id) ON DELETE SET NULL,
  session_id UUID REFERENCES public.program_sessions(id) ON DELETE SET NULL,
  fecha_entrega DATE NOT NULL,
  kg_frutas_hortalizas NUMERIC(10, 2),
  kg_carne NUMERIC(10, 2),
  kg_infantil NUMERIC(10, 2) DEFAULT 0,
  kg_otros NUMERIC(10, 2) DEFAULT 0,
  kg_total NUMERIC(10, 2),
  unidades_no_alimenticias INTEGER,
  recogido_por VARCHAR(255),
  es_autorizado BOOLEAN DEFAULT FALSE,
  firma_url TEXT,
  recogido_por_documento_url TEXT,
  registrado_por TEXT,
  notas TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_deliveries_family_id ON public.deliveries(family_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deliveries_session_id ON public.deliveries(session_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deliveries_grant_id ON public.deliveries(grant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deliveries_fecha_entrega ON public.deliveries(fecha_entrega) WHERE deleted_at IS NULL;
CREATE INDEX idx_deliveries_deleted_at ON public.deliveries(deleted_at);

ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

-- NOTE: These permissive policies were later replaced by 20260506000005_rewrite_deliveries_and_program_sessions_rls.sql
CREATE POLICY "deliveries_select_authenticated" ON public.deliveries FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY "deliveries_insert_authenticated" ON public.deliveries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "deliveries_update_authenticated" ON public.deliveries FOR UPDATE TO authenticated USING (true);
CREATE POLICY "deliveries_delete_authenticated" ON public.deliveries FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.update_deliveries_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deliveries_update_updated_at BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_deliveries_updated_at();
