-- 20260830100001_persons_nombre_norm_search.sql
-- RC-06 (QA F027/F065): manual person search misses full names, trailing
-- spaces and accent variants. Adds an accent-folded generated column
-- persons.nombre_norm (unaccented lowercase "nombre apellidos"), a trigram
-- index (name-search < 2 s budget), and recreates persons_safe to expose it
-- (checkin.searchPersons reads the view). Existence-tolerant throughout.

-- 1. unaccent — install into public (repo convention: pg_trgm also lives in
--    public; see 20260506000006 extension_in_public rationale).
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

-- 2. IMMUTABLE wrapper: plain unaccent() is only STABLE (search_path
--    dictionary lookup) so a generated column cannot call it. Pinning the
--    dictionary schema-qualified makes it deterministic. Multi-shape guard:
--    an environment that enabled the extension via the Supabase dashboard
--    has the dictionary in `extensions`, not `public`.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_ts_dict d JOIN pg_namespace n ON n.oid = d.dictnamespace
    WHERE d.dictname = 'unaccent' AND n.nspname = 'public'
  ) THEN
    CREATE OR REPLACE FUNCTION public.f_unaccent(text)
      RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
      AS $fn$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $fn$;
  ELSIF EXISTS (
    SELECT 1 FROM pg_ts_dict d JOIN pg_namespace n ON n.oid = d.dictnamespace
    WHERE d.dictname = 'unaccent' AND n.nspname = 'extensions'
  ) THEN
    CREATE OR REPLACE FUNCTION public.f_unaccent(text)
      RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
      AS $fn$ SELECT extensions.unaccent('extensions.unaccent'::regdictionary, $1) $fn$;
  ELSE
    RAISE EXCEPTION 'unaccent dictionary found in neither public nor extensions';
  END IF;
END $$;

-- 3. Generated haystack column: unaccented lowercase "nombre apellidos".
ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS nombre_norm text
  GENERATED ALWAYS AS (
    public.f_unaccent(lower(coalesce(nombre, '') || ' ' || coalesce(apellidos, '')))
  ) STORED;

-- 4. Trigram index for substring ilike (< 2 s manual-search budget).
CREATE INDEX IF NOT EXISTS idx_persons_nombre_norm_trgm
  ON public.persons USING gin (nombre_norm gin_trgm_ops);

-- 5. Recreate persons_safe with nombre_norm. Column list copied from
--    20260506000006 (security_invoker; the view keeps excluding the four
--    restricted columns — its projection is part of the PII wall, ADR-0002;
--    nombre_norm derives only from nombre/apellidos, so it is safe).
DROP VIEW IF EXISTS public.persons_safe;
CREATE VIEW public.persons_safe
  WITH (security_invoker = true)
AS
SELECT
  id, nombre, apellidos, nombre_norm, fecha_nacimiento, genero, pais_origen,
  idioma_principal, idiomas,
  telefono, email, direccion, municipio, barrio_zona,
  tipo_documento, numero_documento,
  fecha_llegada_espana,
  tipo_vivienda, estabilidad_habitacional, empadronado,
  nivel_estudios, situacion_laboral, nivel_ingresos,
  persona_referencia, canal_llegada, entidad_derivadora,
  es_retorno, motivo_retorno,
  necesidades_principales, observaciones,
  fase_itinerario, estado_empleo, empresa_empleo, alertas_activas,
  restricciones_alimentarias, foto_perfil_url,
  metadata, created_at, updated_at, deleted_at
FROM public.persons;
