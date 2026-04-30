-- Add es_urgente column separate from tipo
-- Backfill legacy tipo values
-- Add CHECK constraint to prevent new writes with legacy values
-- Add immutable author trigger

-- Add es_urgente column
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS es_urgente boolean NOT NULL DEFAULT false;

-- Backfill: rows with tipo='urgente' become es_urgente=true
UPDATE announcements
  SET es_urgente = true
  WHERE tipo::text = 'urgente';

-- Backfill: convert legacy 'cierre' to 'cierre_servicio'
UPDATE announcements
  SET tipo = 'cierre_servicio'::tipo_announcement
  WHERE tipo::text = 'cierre';

-- Backfill: convert legacy 'urgente' to 'info' (urgency is now a separate flag)
UPDATE announcements
  SET tipo = 'info'::tipo_announcement
  WHERE tipo::text = 'urgente';

-- Add CHECK constraint to prevent new inserts/updates with legacy values
-- This allows reading existing legacy data but blocks new writes
ALTER TABLE announcements
  DROP CONSTRAINT IF EXISTS announcements_tipo_no_legacy;

ALTER TABLE announcements
  ADD CONSTRAINT announcements_tipo_no_legacy
  CHECK (tipo::text NOT IN ('cierre', 'urgente'));

-- Create function to block author changes after creation
CREATE OR REPLACE FUNCTION announcements_block_author_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.autor_id IS DISTINCT FROM OLD.autor_id
     OR NEW.autor_nombre IS DISTINCT FROM OLD.autor_nombre THEN
    RAISE EXCEPTION 'autor_id and autor_nombre are immutable after create';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for immutable author
DROP TRIGGER IF EXISTS announcements_immutable_author ON announcements;
CREATE TRIGGER announcements_immutable_author
  BEFORE UPDATE ON announcements
  FOR EACH ROW
  EXECUTE FUNCTION announcements_block_author_change();

-- Index for urgency queries (banner on /inicio)
CREATE INDEX IF NOT EXISTS idx_announcements_urgente_activo
  ON announcements (es_urgente, activo)
  WHERE es_urgente = true AND activo = true;
