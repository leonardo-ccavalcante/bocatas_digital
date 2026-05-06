-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260413121702 — name: 20260501100500_alter_deliveries_add_session

ALTER TABLE families
  ADD COLUMN IF NOT EXISTS autorizado_documento_url TEXT,
  ADD COLUMN IF NOT EXISTS guf_cutoff_day INTEGER DEFAULT 20,
  ADD COLUMN IF NOT EXISTS guf_verified_at TIMESTAMPTZ;

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES program_sessions(id),
  ADD COLUMN IF NOT EXISTS recogido_por_documento_url TEXT;
