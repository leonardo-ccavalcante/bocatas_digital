-- ============================================================================
-- 20260708000003_import_colectivos_to_typed_column.sql
--
-- ROOT-CAUSE FIX for the colectivo "dual-drawer" split.
--
-- upsert_legacy_person (the single write-point for BOTH titular and dependent
-- persons in confirm_legacy_familias_import) was written before the typed
-- persons.colectivos column existed. It promoted nivel_estudios / situacion_
-- laboral to typed columns but left "colectivo" only inside the metadata JSONB
-- blob. Consequence: the IRPF funder report (which reads the typed column)
-- never saw imported colectivos, and the special-category data sat in an
-- untyped field the app-layer redactor does not cover.
--
-- This replacement teaches the helper the typed column: it normalizes the
-- legacy metadata.colectivos tags into the enum and writes persons.colectivos,
-- then STRIPS colectivos out of the stored metadata blob so there is exactly
-- ONE home for the data (no duplicate).
--
-- LAWFUL BASIS (RGPD): colectivo is special-category (Art. 9/10). Persisting it
-- on import is lawful as CONTINUITY OF PROCESSING — the data subject already
-- consented in the legacy GUF/Bocatas process; this migrates already-lawfully-
-- held data to the new platform, it is NOT a new collection. Documented in
-- docs/legal/eipd-addendum-colectivos-DRAFT.md. (The registration form path,
-- by contrast, collects fresh under explicit Art. 9(2)(a) consent.)
--
-- Pure logic replacement: signature, RETURNS, SECURITY DEFINER posture,
-- search_path, COMMENT and the revoked EXECUTE grant are preserved unchanged
-- from the live definition (20260604000001, dedup-by-document). Only the
-- colectivos handling is added.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.upsert_legacy_person(p_person jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_new_id uuid;
  v_numdoc text;
  v_genero genero;
  v_tipo_documento tipo_documento;
  v_nivel_estudios nivel_estudios;
  v_situacion_laboral situacion_laboral;
  v_fecha_nacimiento date;
  v_colectivos colectivo[];
BEGIN
  v_fecha_nacimiento := NULLIF(p_person ->> 'fecha_nacimiento', '')::date;
  v_numdoc := NULLIF(p_person ->> 'numero_documento', '');

  -- Dedup strictly by document number (strong identity). Name+DOB is NOT used
  -- as a match key — it false-merges distinct people. No document ⇒ new row.
  IF v_numdoc IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM persons
    WHERE numero_documento = v_numdoc
      AND deleted_at IS NULL
    LIMIT 1;
    IF FOUND THEN RETURN v_existing_id; END IF;
  END IF;

  v_genero := NULLIF(p_person ->> 'genero', '')::genero;
  v_tipo_documento := NULLIF(p_person ->> 'tipo_documento', '')::tipo_documento;
  v_nivel_estudios := NULLIF(p_person ->> 'nivel_estudios', '')::nivel_estudios;
  v_situacion_laboral := NULLIF(p_person ->> 'situacion_laboral', '')::situacion_laboral;

  -- Normalize the legacy metadata.colectivos tags (capitalized by the CSV
  -- mapper: Gitanos / LGTBI / Sin_Hogar / Reclusos) into the typed enum,
  -- mirroring the one-time backfill in 20260708000002. Non-array / unknown /
  -- absent → NULL (never guessed). array_agg over zero rows yields NULL.
  SELECT array_agg(DISTINCT c ORDER BY c)
    INTO v_colectivos
    FROM (
      SELECT (CASE lower(tag)
        WHEN 'lgtbi'     THEN 'lgtbi'
        WHEN 'gitanos'   THEN 'gitanos'
        WHEN 'sin_hogar' THEN 'sin_hogar'
        WHEN 'reclusos'  THEN 'reclusos_exreclusos'
        ELSE NULL END)::colectivo AS c
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(p_person -> 'metadata' -> 'colectivos') = 'array'
               THEN p_person -> 'metadata' -> 'colectivos'
               ELSE '[]'::jsonb END
        ) AS tag
    ) mapped
   WHERE c IS NOT NULL;

  INSERT INTO persons (
    nombre,
    apellidos,
    fecha_nacimiento,
    genero,
    pais_origen,
    telefono,
    email,
    direccion,
    municipio,
    tipo_documento,
    numero_documento,
    nivel_estudios,
    situacion_laboral,
    observaciones,
    codigo_postal,
    canal_llegada,
    idioma_principal,
    colectivos,
    metadata
  )
  VALUES (
    p_person ->> 'nombre',
    p_person ->> 'apellidos',
    v_fecha_nacimiento,
    v_genero,
    NULLIF(p_person ->> 'pais_origen', ''),
    NULLIF(p_person ->> 'telefono', ''),
    NULLIF(p_person ->> 'email', ''),
    NULLIF(p_person ->> 'direccion', ''),
    NULLIF(p_person ->> 'municipio', ''),
    v_tipo_documento,
    v_numdoc,
    v_nivel_estudios,
    v_situacion_laboral,
    NULLIF(p_person ->> 'observaciones', ''),
    -- Validated 5-digit CP from the mapper (parseCodigoPostal); the persons CHECK
    -- is ^\d{5}$ and a trigger derives distrito from it.
    NULLIF(p_person ->> 'codigo_postal', ''),
    'programa_familias'::canal_llegada,
    'es'::idioma,
    v_colectivos,
    -- Strip the now-redundant colectivos out of the stored metadata blob: the
    -- typed persons.colectivos column above is the single home (kills the
    -- dual-drawer duplicate; the metadata copy was never redaction-covered).
    (COALESCE(p_person -> 'metadata', '{}'::jsonb) - 'colectivos')
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_legacy_person(jsonb) IS
  'Internal helper for the legacy FAMILIAS importers: dedup-by-document-or-insert a persons row. Name+DOB is intentionally NOT a match key (false-merge / RGPD accuracy). Promotes legacy metadata.colectivos → typed persons.colectivos (special-category, continuity-of-processing basis) and strips it from stored metadata. Not callable by application code.';

REVOKE EXECUTE ON FUNCTION public.upsert_legacy_person(jsonb) FROM PUBLIC, authenticated;
