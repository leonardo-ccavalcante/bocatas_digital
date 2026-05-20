-- M2 — Mirror M1 on the persons table.
-- Phase 2, Stage S1.
--
-- Reuses madrid_distrito_for() from M1; only adds the columns + trigger here.
-- Allows Mapa tab to aggregate over either persons OR families
-- (k-anonymity floor 3 applies to the surfaced layer regardless).

ALTER TABLE persons
  ADD COLUMN IF NOT EXISTS codigo_postal TEXT
    CHECK (codigo_postal IS NULL OR codigo_postal ~ '^\d{5}$'),
  ADD COLUMN IF NOT EXISTS distrito TEXT;

COMMENT ON COLUMN persons.codigo_postal IS
  '5-digit Spanish postal code (28xxx for Madrid). Optional. Captured in '
  'RegistrationWizard Step3Contacto. Drives persons.distrito via the '
  'trg_persons_set_distrito trigger.';

COMMENT ON COLUMN persons.distrito IS
  'Administrative distrito slug populated automatically from codigo_postal '
  'via madrid_distrito_for(). See M1 for the function definition.';

CREATE INDEX IF NOT EXISTS idx_persons_distrito
  ON persons (distrito)
  WHERE distrito IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION persons_set_distrito_from_codigo_postal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.codigo_postal IS DISTINCT FROM OLD.codigo_postal THEN
    NEW.distrito := madrid_distrito_for(NEW.codigo_postal);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_persons_set_distrito ON persons;

CREATE TRIGGER trg_persons_set_distrito
  BEFORE INSERT OR UPDATE OF codigo_postal ON persons
  FOR EACH ROW
  EXECUTE FUNCTION persons_set_distrito_from_codigo_postal();
