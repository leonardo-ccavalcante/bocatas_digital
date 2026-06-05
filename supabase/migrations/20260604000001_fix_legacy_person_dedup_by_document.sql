-- B1 FIX (RGPD Art. 5(1)(d) accuracy + data integrity).
--
-- The original upsert_legacy_person deduped persons on
-- (nombre, apellidos, fecha_nacimiento) across ALL families, with no family
-- scope and no UNIQUE constraint. Two unrelated beneficiaries who happen to
-- share a common name AND birthdate (e.g. "María García", 1990-01-01) silently
-- collapsed into a SINGLE persons row — and families.titular_id /
-- familia_miembros.person_id from two different families then pointed at the
-- same physical person. PII attributed to the wrong data subject.
--
-- Fix: dedup ONLY by `numero_documento` — a strong, family-independent identity
-- key (a document number identifies a person; matching it cross-family is
-- correct). When no document is present we INSERT a fresh person
-- (refuse-to-merge) rather than risk a false merge on name+DOB alone.
--
-- This is a pure logic replacement of the helper; signature, SECURITY DEFINER
-- posture, and the revoked EXECUTE grant are preserved unchanged.

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
    COALESCE(p_person -> 'metadata', '{}'::jsonb)
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_legacy_person(jsonb) IS
  'Internal helper for the legacy FAMILIAS importers: dedup-by-document-or-insert a persons row. Name+DOB is intentionally NOT a match key (false-merge / RGPD accuracy). Not callable by application code.';

REVOKE EXECUTE ON FUNCTION public.upsert_legacy_person(jsonb) FROM PUBLIC, authenticated;
