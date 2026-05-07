-- IDEMPOTENT migration: captures the live announcements table schema.
-- Safe to run against either an empty DB (local dev) or the live DB with existing data.

-- Create tipo_announcement enum if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_announcement') THEN
    CREATE TYPE tipo_announcement AS ENUM (
      'info',
      'evento',
      'cierre_servicio',
      'convocatoria',
      -- Legacy values kept for back-compat read; CHECK constraint in migration #3 prevents new writes
      'cierre',
      'urgente'
    );
  END IF;
END $$;

-- Create announcements table if it doesn't exist
-- Schema mirrors client/src/lib/database.types.ts lines 74-124
CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  contenido text NOT NULL,
  tipo text NOT NULL DEFAULT 'info',
  activo boolean NOT NULL DEFAULT true,
  fijado boolean NOT NULL DEFAULT false,
  fecha_inicio timestamptz NOT NULL DEFAULT now(),
  fecha_fin timestamptz,
  imagen_url text,
  autor_id uuid,
  autor_nombre text,
  roles_visibles text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Convert tipo column from text to tipo_announcement enum if not already.
-- Postgres can't auto-cast a `text` default to an enum type, so drop the
-- default first, convert the type, then re-apply the default explicitly
-- as the enum value (re-applied below at the unconditional ALTER step).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'announcements'
    AND column_name = 'tipo'
    AND data_type = 'text'
  ) THEN
    ALTER TABLE announcements ALTER COLUMN tipo DROP DEFAULT;
    ALTER TABLE announcements
      ALTER COLUMN tipo TYPE tipo_announcement
      USING tipo::tipo_announcement;
  END IF;
END $$;

-- Ensure default uses the enum type
ALTER TABLE announcements
  ALTER COLUMN tipo SET DEFAULT 'info'::tipo_announcement;

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION update_announcements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS announcements_updated_at ON announcements;
CREATE TRIGGER announcements_updated_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW
  EXECUTE FUNCTION update_announcements_updated_at();

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_announcements_activo_fecha
  ON announcements (activo, fecha_inicio DESC)
  WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_announcements_tipo
  ON announcements (tipo);
