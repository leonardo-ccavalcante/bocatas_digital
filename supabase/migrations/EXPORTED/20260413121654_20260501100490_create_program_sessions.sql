-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260413121654 — name: 20260501100490_create_program_sessions

ALTER TABLE programs ADD COLUMN IF NOT EXISTS session_close_config JSONB DEFAULT '{"enabled":false,"uploads":[],"fields":[]}'::jsonb;

CREATE TABLE IF NOT EXISTS program_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id     UUID NOT NULL REFERENCES programs(id),
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  location_id    UUID REFERENCES locations(id),
  opened_by      UUID REFERENCES auth.users(id),
  closed_by      UUID REFERENCES auth.users(id),
  session_data   JSONB DEFAULT '{}'::jsonb,
  closed_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_program_sessions_open
  ON program_sessions (program_id, fecha, location_id)
  WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_program_sessions_program_fecha
  ON program_sessions (program_id, fecha);
