-- Phase 2 (roster extra fields): confirm_legacy_familias_import now writes the
-- family-level fields the CSV carries that the v1 left at defaults:
--   * families.estado          ← titular row's ACTIVA/BAJA (parseEstado), default 'activa'
--   * families.num_miembros     ← actual row count of the group
--   * families.num_menores_18   ← members with a parsed DOB under 18 today
--   * families.num_adultos      ← num_miembros − num_menores_18
--   * families.codigo_postal    ← titular's validated 5-digit CP (trigger derives distrito)
--
-- Pure CREATE OR REPLACE of the main RPC; security posture, per-family
-- savepoints, audit, sanitiser, idempotency, and grants are unchanged. The
-- dedup + persons.codigo_postal write live in upsert_legacy_person (migration
-- 20260604000001).

CREATE OR REPLACE FUNCTION public.confirm_legacy_familias_import(
  p_token        uuid,
  p_src_filename text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id     text;
  v_role         text;
  v_preview      bulk_import_previews%ROWTYPE;
  v_groups       jsonb;
  v_group        jsonb;
  v_titular_row  jsonb;
  v_dep_row      jsonb;
  v_legacy_num   text;
  v_titular_id   uuid;
  v_family_id    uuid;
  v_dep_person_id uuid;
  v_titular_index int;
  v_row_count    int;
  v_num_menores  int;
  v_num_adultos  int;
  v_dob          date;
  v_created      int := 0;
  v_skipped      int := 0;
  v_errors       int := 0;
  v_error_list   jsonb := '[]'::jsonb;
  v_safe_errmsg  text;
BEGIN
  v_role := public.get_user_role();
  IF v_role NOT IN ('superadmin', 'admin') THEN
    RAISE EXCEPTION 'forbidden: legacy import requires admin role'
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

  v_groups := v_preview.parsed_rows -> 'groups';
  IF v_groups IS NULL OR jsonb_typeof(v_groups) <> 'array' THEN
    RAISE EXCEPTION 'preview malformed: groups[] missing';
  END IF;

  FOR i IN 0 .. jsonb_array_length(v_groups) - 1 LOOP
    v_group := v_groups -> i;
    v_legacy_num := v_group ->> 'legacy_numero_familia';
    v_titular_index := (v_group ->> 'titular_index')::int;
    v_row_count := jsonb_array_length(v_group -> 'rows');

    BEGIN
      -- 1. Idempotency: skip if already imported.
      IF EXISTS (
        SELECT 1 FROM families
        WHERE legacy_numero = v_legacy_num
          AND deleted_at IS NULL
      ) THEN
        v_skipped := v_skipped + 1;
        INSERT INTO family_legacy_import_audit(
          actor_id, family_id, legacy_numero, operation, row_count, src_filename
        ) VALUES (
          v_actor_id, NULL, v_legacy_num, 'skipped_duplicate', v_row_count, p_src_filename
        );
        CONTINUE;
      END IF;

      -- 2. Derive member counts from parsed DOBs (best-effort; rows without a
      --    DOB count as adults — the safer default for subsidy purposes).
      v_num_menores := 0;
      FOR k IN 0 .. v_row_count - 1 LOOP
        v_dob := NULLIF(((v_group -> 'rows') -> k) -> 'person' ->> 'fecha_nacimiento', '')::date;
        IF v_dob IS NOT NULL AND v_dob > (CURRENT_DATE - INTERVAL '18 years') THEN
          v_num_menores := v_num_menores + 1;
        END IF;
      END LOOP;
      v_num_adultos := GREATEST(v_row_count - v_num_menores, 0);

      -- 3. Insert / resolve titular person.
      v_titular_row := (v_group -> 'rows') -> v_titular_index;
      v_titular_id := upsert_legacy_person(v_titular_row -> 'person');

      -- 4. Insert family (now incl. estado / counts / CP).
      INSERT INTO families (
        titular_id,
        legacy_numero,
        fecha_alta,
        estado,
        num_miembros,
        num_adultos,
        num_menores_18,
        codigo_postal,
        persona_recoge,
        metadata
      )
      VALUES (
        v_titular_id,
        v_legacy_num,
        COALESCE(NULLIF(v_titular_row ->> 'fecha_alta', '')::date, CURRENT_DATE),
        COALESCE(NULLIF(v_titular_row ->> 'estado', ''), 'activa'),
        v_row_count,
        v_num_adultos,
        v_num_menores,
        NULLIF(v_titular_row -> 'person' ->> 'codigo_postal', ''),
        TRIM(BOTH ' ' FROM
          (v_titular_row -> 'person' ->> 'nombre') || ' ' ||
          COALESCE(v_titular_row -> 'person' ->> 'apellidos', '')
        ),
        jsonb_build_object(
          'imported_from', 'legacy_csv_v1',
          'src_filename', p_src_filename,
          'imported_by', v_actor_id,
          'imported_at', now(),
          'legacy_orden', v_titular_row -> 'person' -> 'metadata' ->> 'legacy_orden'
        )
      )
      RETURNING id INTO v_family_id;

      -- 5. Insert dependents.
      FOR j IN 0 .. v_row_count - 1 LOOP
        IF j = v_titular_index THEN CONTINUE; END IF;
        v_dep_row := (v_group -> 'rows') -> j;
        v_dep_person_id := upsert_legacy_person(v_dep_row -> 'person');

        INSERT INTO familia_miembros (
          familia_id,
          person_id,
          nombre,
          apellidos,
          rol,
          relacion,
          fecha_nacimiento,
          documento,
          estado
        )
        VALUES (
          v_family_id,
          v_dep_person_id,
          v_dep_row -> 'person' ->> 'nombre',
          v_dep_row -> 'person' ->> 'apellidos',
          'dependent',
          v_dep_row ->> 'relacion_db',
          NULLIF(v_dep_row -> 'person' ->> 'fecha_nacimiento', '')::date,
          NULLIF(v_dep_row -> 'person' ->> 'numero_documento', ''),
          -- member-level estado (A/B) when present, else 'activo'
          CASE WHEN (v_dep_row ->> 'estado') = 'baja' THEN 'baja' ELSE 'activo' END
        );
      END LOOP;

      -- 6. Audit success.
      INSERT INTO family_legacy_import_audit (
        actor_id, family_id, legacy_numero, operation, row_count, src_filename
      ) VALUES (
        v_actor_id, v_family_id, v_legacy_num, 'created', v_row_count, p_src_filename
      );

      v_created := v_created + 1;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      v_safe_errmsg := public.sanitize_audit_error(SQLERRM);
      v_error_list := v_error_list || jsonb_build_object(
        'legacy_numero_familia', v_legacy_num,
        'message', v_safe_errmsg
      );
      INSERT INTO family_legacy_import_audit (
        actor_id, family_id, legacy_numero, operation, row_count, src_filename, notes
      ) VALUES (
        v_actor_id, NULL, v_legacy_num, 'failed', v_row_count, p_src_filename, v_safe_errmsg
      );
    END;
  END LOOP;

  DELETE FROM bulk_import_previews WHERE token = p_token;

  RETURN jsonb_build_object(
    'created_count', v_created,
    'skipped_count', v_skipped,
    'error_count',   v_errors,
    'errors',        v_error_list
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_legacy_familias_import(uuid, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_legacy_familias_import(uuid, text) TO authenticated;
