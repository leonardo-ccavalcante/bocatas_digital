-- M1 — Add codigo_postal + distrito to families + madrid_distrito_for() function.
-- Phase 2, Stage S1 of the parallel-implementation plan
-- (read-the-file-users-familiagirardicavalc-cheerful-meerkat.md).
--
-- The CASE list below MUST stay byte-identical to the TS map in
-- shared/madrid/postalCodeToDistrito.ts. The drift-guard test
-- server/__tests__/madrid-distrito-drift.test.ts asserts this on every
-- vitest run. Adding a code here without updating the TS map (or vice
-- versa) fails CI.

-- ---------------------------------------------------------------------------
-- 1. Function: madrid_distrito_for(text) → text
--
-- Returns the slug of the Madrid distrito a given 5-digit postal code falls
-- within, or NULL if the code is outside Madrid municipality (or unknown).
-- STABLE — deterministic, no DB access. IMMUTABLE would be tempting but
-- "immutable" implies the result will never change for the same input;
-- postal-code → distrito assignments can shift (rarely) when Madrid
-- redistricts. STABLE is the honest marker.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION madrid_distrito_for(postal_code TEXT)
RETURNS TEXT
LANGUAGE SQL
STABLE
PARALLEL SAFE
AS $$
  SELECT CASE postal_code
    -- Centro
    WHEN '28004' THEN 'centro'
    WHEN '28012' THEN 'centro'
    WHEN '28013' THEN 'centro'
    WHEN '28014' THEN 'centro'
    -- Arganzuela
    WHEN '28005' THEN 'arganzuela'
    WHEN '28045' THEN 'arganzuela'
    -- Retiro
    WHEN '28007' THEN 'retiro'
    WHEN '28009' THEN 'retiro'
    -- Salamanca
    WHEN '28001' THEN 'salamanca'
    WHEN '28006' THEN 'salamanca'
    WHEN '28028' THEN 'salamanca'
    -- Chamartín
    WHEN '28002' THEN 'chamartin'
    WHEN '28036' THEN 'chamartin'
    WHEN '28046' THEN 'chamartin'
    -- Tetuán
    WHEN '28020' THEN 'tetuan'
    WHEN '28039' THEN 'tetuan'
    -- Chamberí
    WHEN '28003' THEN 'chamberi'
    WHEN '28010' THEN 'chamberi'
    WHEN '28015' THEN 'chamberi'
    -- Fuencarral-El Pardo
    WHEN '28029' THEN 'fuencarral-el-pardo'
    WHEN '28034' THEN 'fuencarral-el-pardo'
    WHEN '28035' THEN 'fuencarral-el-pardo'
    WHEN '28048' THEN 'fuencarral-el-pardo'
    WHEN '28049' THEN 'fuencarral-el-pardo'
    -- Moncloa-Aravaca
    WHEN '28008' THEN 'moncloa-aravaca'
    WHEN '28023' THEN 'moncloa-aravaca'
    WHEN '28040' THEN 'moncloa-aravaca'
    -- Latina
    WHEN '28011' THEN 'latina'
    WHEN '28024' THEN 'latina'
    WHEN '28047' THEN 'latina'
    -- Carabanchel
    WHEN '28019' THEN 'carabanchel'
    WHEN '28025' THEN 'carabanchel'
    WHEN '28044' THEN 'carabanchel'
    -- Usera
    WHEN '28026' THEN 'usera'
    -- Puente de Vallecas
    WHEN '28018' THEN 'puente-de-vallecas'
    WHEN '28038' THEN 'puente-de-vallecas'
    -- Moratalaz
    WHEN '28030' THEN 'moratalaz'
    -- Ciudad Lineal
    WHEN '28017' THEN 'ciudad-lineal'
    WHEN '28027' THEN 'ciudad-lineal'
    WHEN '28037' THEN 'ciudad-lineal'
    -- Hortaleza
    WHEN '28033' THEN 'hortaleza'
    WHEN '28043' THEN 'hortaleza'
    WHEN '28050' THEN 'hortaleza'
    -- Villaverde
    WHEN '28021' THEN 'villaverde'
    WHEN '28041' THEN 'villaverde'
    -- Villa de Vallecas
    WHEN '28031' THEN 'villa-de-vallecas'
    WHEN '28051' THEN 'villa-de-vallecas'
    -- Vicálvaro
    WHEN '28032' THEN 'vicalvaro'
    WHEN '28052' THEN 'vicalvaro'
    -- San Blas-Canillejas
    WHEN '28022' THEN 'san-blas-canillejas'
    WHEN '28053' THEN 'san-blas-canillejas'
    -- Barajas
    WHEN '28042' THEN 'barajas'
    WHEN '28055' THEN 'barajas'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION madrid_distrito_for(TEXT) IS
  'Maps a 5-digit Madrid postal code to its administrative distrito slug. '
  'Returns NULL for codes outside Madrid municipality. The CASE list MUST '
  'mirror shared/madrid/postalCodeToDistrito.ts (drift-guarded by '
  'server/__tests__/madrid-distrito-drift.test.ts).';

-- ---------------------------------------------------------------------------
-- 2. Columns on families: codigo_postal + distrito
-- ---------------------------------------------------------------------------

ALTER TABLE families
  ADD COLUMN IF NOT EXISTS codigo_postal TEXT
    CHECK (codigo_postal IS NULL OR codigo_postal ~ '^\d{5}$'),
  ADD COLUMN IF NOT EXISTS distrito TEXT;

COMMENT ON COLUMN families.codigo_postal IS
  '5-digit Spanish postal code (28xxx for Madrid municipality). Captured at '
  'familia registration. Drives the families.distrito column via the '
  'trg_families_set_distrito trigger.';

COMMENT ON COLUMN families.distrito IS
  'Administrative distrito slug, populated automatically from codigo_postal '
  'via madrid_distrito_for(). NULL when codigo_postal is NULL or outside '
  'Madrid. Used by the Mapa tab choropleth + Compliance aggregation.';

-- Partial index for Mapa aggregation: WHERE distrito IS NOT NULL AND deleted_at IS NULL
CREATE INDEX IF NOT EXISTS idx_families_distrito
  ON families (distrito)
  WHERE distrito IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Trigger: keep distrito in sync with codigo_postal
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION families_set_distrito_from_codigo_postal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only recompute distrito if codigo_postal changed (or on INSERT).
  IF TG_OP = 'INSERT'
     OR NEW.codigo_postal IS DISTINCT FROM OLD.codigo_postal THEN
    NEW.distrito := madrid_distrito_for(NEW.codigo_postal);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_families_set_distrito ON families;

CREATE TRIGGER trg_families_set_distrito
  BEFORE INSERT OR UPDATE OF codigo_postal ON families
  FOR EACH ROW
  EXECUTE FUNCTION families_set_distrito_from_codigo_postal();

-- ---------------------------------------------------------------------------
-- 4. Backfill: skipped — operational task for Sole (see plan §12 open items #3
-- in the non-blocking list). Existing rows have codigo_postal=NULL until
-- volunteers add the postal code via the wizard or batch update.
-- ---------------------------------------------------------------------------
