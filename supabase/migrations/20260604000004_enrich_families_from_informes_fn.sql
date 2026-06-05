-- enrich_families_from_informes — the INFORMES SOCIALES enrich pass (v1).
--
-- Backfill-only enrichment of families the roster already created (joined by
-- families.legacy_numero). Per family:
--   * family NOT found            → 'skipped_missing' (INFORMES never creates families)
--   * narrative (situación/necesidades) → written ONLY when the target is empty
--   * titular persons fields       → COALESCE backfill (never overrides a non-empty value)
--   * members                      → NOT written in v1 (parentesco/DNI backfill is the
--                                     family-scoped, refuse-on-ambiguity follow-up)
--
-- Same security + resilience posture as confirm_legacy_familias_import: SECURITY
-- DEFINER, admin role gate, auth.uid() actor, ownership+TTL re-check, per-family
-- savepoint (BEGIN/EXCEPTION), audit row per family, sanitized errors, one-use token.

CREATE OR REPLACE FUNCTION public.enrich_families_from_informes(
  p_token        uuid,
  p_src_filename text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id   text;
  v_role       text;
  v_preview    bulk_import_previews%ROWTYPE;
  v_families   jsonb;
  v_fam        jsonb;
  v_tit        jsonb;
  v_legacy_num text;
  v_family_id  uuid;
  v_titular_id uuid;
  v_enriched   int := 0;
  v_skipped    int := 0;
  v_errors     int := 0;
  v_error_list jsonb := '[]'::jsonb;
  v_safe_errmsg text;
BEGIN
  v_role := public.get_user_role();
  IF v_role NOT IN ('superadmin', 'admin') THEN
    RAISE EXCEPTION 'forbidden: informes enrich requires admin role'
      USING ERRCODE = '42501';
  END IF;

  v_actor_id := COALESCE(auth.uid()::text, '');
  IF v_actor_id = '' THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_preview
  FROM bulk_import_previews
  WHERE token = p_token
    AND created_by = v_actor_id
    AND created_at > now() - interval '30 minutes';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'preview expired or not found';
  END IF;

  IF (v_preview.parsed_rows ->> 'kind') IS DISTINCT FROM 'informes_enrich_v1' THEN
    RAISE EXCEPTION 'preview is not an informes_enrich_v1 payload';
  END IF;

  v_families := v_preview.parsed_rows -> 'families';
  IF v_families IS NULL OR jsonb_typeof(v_families) <> 'array' THEN
    RAISE EXCEPTION 'preview malformed: families[] missing';
  END IF;

  FOR i IN 0 .. jsonb_array_length(v_families) - 1 LOOP
    v_fam := v_families -> i;
    v_legacy_num := v_fam ->> 'legacy_numero_familia';
    v_tit := v_fam -> 'titular';

    BEGIN
      SELECT id, titular_id INTO v_family_id, v_titular_id
      FROM families
      WHERE legacy_numero = v_legacy_num
        AND deleted_at IS NULL
      LIMIT 1;

      IF v_family_id IS NULL THEN
        v_skipped := v_skipped + 1;
        INSERT INTO family_legacy_import_audit(
          actor_id, family_id, legacy_numero, operation, row_count, src_filename
        ) VALUES (
          v_actor_id, NULL, v_legacy_num, 'skipped_missing', 0, p_src_filename
        );
        CONTINUE;
      END IF;

      -- Narrative: write ONLY when the target column is currently empty (do not
      -- overwrite a richer/curated value with a possibly-staler re-import).
      UPDATE families SET
        situacion_familiar_texto =
          COALESCE(NULLIF(situacion_familiar_texto, ''), NULLIF(v_fam ->> 'situacion_familiar_texto', '')),
        necesidades_texto =
          COALESCE(NULLIF(necesidades_texto, ''), NULLIF(v_fam ->> 'necesidades_texto', '')),
        updated_at = now()
      WHERE id = v_family_id;

      -- Titular backfill: COALESCE so a non-empty existing value is never
      -- overridden. Validated values come from the parser's coercers.
      IF v_titular_id IS NOT NULL THEN
        UPDATE persons SET
          telefono        = COALESCE(NULLIF(telefono, ''),        NULLIF(v_tit ->> 'telefono', '')),
          direccion       = COALESCE(NULLIF(direccion, ''),       NULLIF(v_tit ->> 'direccion', '')),
          municipio       = COALESCE(NULLIF(municipio, ''),       NULLIF(v_tit ->> 'municipio', '')),
          pais_origen     = COALESCE(NULLIF(pais_origen, ''),     NULLIF(v_tit ->> 'pais_origen', '')),
          codigo_postal   = COALESCE(NULLIF(codigo_postal, ''),   NULLIF(v_tit ->> 'codigo_postal', '')),
          numero_documento= COALESCE(NULLIF(numero_documento, ''),NULLIF(v_tit ->> 'numero_documento', '')),
          tipo_documento  = COALESCE(tipo_documento,              NULLIF(v_tit ->> 'tipo_documento', '')::tipo_documento),
          fecha_nacimiento= COALESCE(fecha_nacimiento,            NULLIF(v_tit ->> 'fecha_nacimiento', '')::date),
          updated_at = now()
        WHERE id = v_titular_id;
      END IF;

      INSERT INTO family_legacy_import_audit(
        actor_id, family_id, legacy_numero, operation, row_count, src_filename
      ) VALUES (
        v_actor_id, v_family_id, v_legacy_num, 'enriched',
        jsonb_array_length(COALESCE(v_fam -> 'members', '[]'::jsonb)), p_src_filename
      );
      v_enriched := v_enriched + 1;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      v_safe_errmsg := public.sanitize_audit_error(SQLERRM);
      v_error_list := v_error_list || jsonb_build_object(
        'legacy_numero_familia', v_legacy_num,
        'message', v_safe_errmsg
      );
      INSERT INTO family_legacy_import_audit(
        actor_id, family_id, legacy_numero, operation, row_count, src_filename, notes
      ) VALUES (
        v_actor_id, NULL, v_legacy_num, 'failed', 0, p_src_filename, v_safe_errmsg
      );
    END;
  END LOOP;

  DELETE FROM bulk_import_previews WHERE token = p_token;

  RETURN jsonb_build_object(
    'enriched_count',        v_enriched,
    'skipped_missing_count', v_skipped,
    'error_count',           v_errors,
    'errors',                v_error_list
  );
END;
$$;

COMMENT ON FUNCTION public.enrich_families_from_informes(uuid, text) IS
  'INFORMES SOCIALES enrich pass (v1): backfill-only enrichment of existing families (by legacy_numero) — family narrative (write-when-empty) + titular COALESCE backfill. Members not written in v1. Admin/superadmin only.';

REVOKE EXECUTE ON FUNCTION public.enrich_families_from_informes(uuid, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.enrich_families_from_informes(uuid, text) TO authenticated;
