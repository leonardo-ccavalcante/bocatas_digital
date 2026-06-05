-- Migration: 20260605000004_confirm_legacy_import_excluded_numbers
--
-- Adds an optional `p_excluded_numbers text[]` parameter to
-- `confirm_legacy_familias_import`.  When provided, any family whose
-- `legacy_numero_familia` is in the array is counted as "skipped" and
-- recorded in the audit log as 'skipped_excluded' — it is NOT imported.
--
-- This powers the frontend "Solo importar familias OK" toggle: the modal
-- passes the legacy numbers of warning/duplicate families so only the
-- clean (OK) families are committed.
--
-- All other behaviour is unchanged.  The function is re-created with
-- `CREATE OR REPLACE FUNCTION` so the REVOKE/GRANT at the bottom remain
-- consistent with the previous version.

-- ── 1. Extend audit operation CHECK to include 'skipped_excluded' ────────────
ALTER TABLE family_legacy_import_audit
  DROP CONSTRAINT IF EXISTS family_legacy_import_audit_operation_check;
ALTER TABLE family_legacy_import_audit
  ADD CONSTRAINT family_legacy_import_audit_operation_check
  CHECK (operation IN (
    'created', 'skipped_duplicate', 'failed', 'enriched',
    'skipped_missing', 'updated', 'skipped_excluded'
  ));

-- ── 2. Replace the function with the new signature ───────────────────────────
DROP FUNCTION IF EXISTS public.confirm_legacy_familias_import(uuid, text, text);

CREATE FUNCTION public.confirm_legacy_familias_import(
  p_token             uuid,
  p_src_filename      text    DEFAULT NULL,
  p_mode              text    DEFAULT 'skip',
  p_excluded_numbers  text[]  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id      text;
  v_role          text;
  v_preview       bulk_import_previews%ROWTYPE;
  v_program_id    uuid;
  v_groups        jsonb;
  v_group         jsonb;
  v_titular_row   jsonb;
  v_dep_row       jsonb;
  v_legacy_num    text;
  v_titular_id    uuid;
  v_family_id     uuid;
  v_dep_person_id uuid;
  v_titular_index int;
  v_row_count     int;
  v_num_menores   int;
  v_num_adultos   int;
  v_dob           date;
  v_doc           text;
  v_member_id     uuid;
  v_member_person uuid;
  v_used_ids      uuid[];
  v_enrollment_missing boolean := false;
  v_created       int := 0;
  v_updated       int := 0;
  v_skipped       int := 0;
  v_errors        int := 0;
  v_error_list    jsonb := '[]'::jsonb;
  v_safe_errmsg   text;
BEGIN
  v_role := public.get_user_role();
  IF v_role NOT IN ('superadmin', 'admin') THEN
    RAISE EXCEPTION 'forbidden: legacy import requires admin role'
      USING ERRCODE = '42501';
  END IF;

  v_actor_id := auth.jwt() ->> 'sub';
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id missing from JWT sub';
  END IF;

  -- Ownership + TTL check (defence-in-depth; the tRPC layer also pre-checks).
  SELECT * INTO v_preview
  FROM bulk_import_previews
  WHERE token = p_token
    AND created_by = v_actor_id
    AND created_at >= now() - INTERVAL '30 minutes';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'preview expired or not found';
  END IF;

  v_groups := v_preview.parsed_rows -> 'groups';
  IF v_groups IS NULL OR jsonb_typeof(v_groups) <> 'array' THEN
    RAISE EXCEPTION 'preview malformed: groups[] missing';
  END IF;

  -- Familia program for enrollment (resolved by slug; best-effort).
  SELECT id INTO v_program_id FROM programs WHERE slug = 'programa_familias' LIMIT 1;
  IF v_program_id IS NULL THEN
    v_enrollment_missing := true;
  END IF;

  FOR i IN 0 .. jsonb_array_length(v_groups) - 1 LOOP
    v_group := v_groups -> i;
    v_legacy_num := v_group ->> 'legacy_numero_familia';
    v_titular_index := (v_group ->> 'titular_index')::int;
    v_row_count := jsonb_array_length(v_group -> 'rows');
    v_titular_row := (v_group -> 'rows') -> v_titular_index;

    BEGIN
      -- ── EXCLUDED: skip families the caller explicitly excluded ─────────────
      IF p_excluded_numbers IS NOT NULL AND v_legacy_num = ANY(p_excluded_numbers) THEN
        v_skipped := v_skipped + 1;
        INSERT INTO family_legacy_import_audit(
          actor_id, family_id, legacy_numero, operation, row_count, src_filename
        ) VALUES (
          v_actor_id, NULL, v_legacy_num, 'skipped_excluded', v_row_count, p_src_filename
        );
        CONTINUE;
      END IF;

      -- Member counts from parsed DOBs (rows without a DOB count as adults).
      v_num_menores := 0;
      FOR k IN 0 .. v_row_count - 1 LOOP
        v_dob := NULLIF(((v_group -> 'rows') -> k) -> 'person' ->> 'fecha_nacimiento', '')::date;
        IF v_dob IS NOT NULL AND v_dob > (CURRENT_DATE - INTERVAL '18 years') THEN
          v_num_menores := v_num_menores + 1;
        END IF;
      END LOOP;
      v_num_adultos := GREATEST(v_row_count - v_num_menores, 0);

      -- Existing family?
      SELECT id, titular_id INTO v_family_id, v_titular_id
      FROM families
      WHERE legacy_numero = v_legacy_num AND deleted_at IS NULL
      LIMIT 1;

      -- ── SKIP mode (or existing + not update): idempotent skip ──────────────
      IF v_family_id IS NOT NULL AND p_mode = 'skip' THEN
        v_skipped := v_skipped + 1;
        INSERT INTO family_legacy_import_audit(
          actor_id, family_id, legacy_numero, operation, row_count, src_filename
        ) VALUES (
          v_actor_id, NULL, v_legacy_num, 'skipped_duplicate', v_row_count, p_src_filename
        );
        CONTINUE;
      END IF;

      -- ── UPDATE mode: re-sync an existing family ────────────────────────────
      IF v_family_id IS NOT NULL AND p_mode = 'update' THEN
        -- Family operational fields OVERWRITTEN; codigo_postal overwrite-when-present.
        UPDATE families SET
          estado          = COALESCE(NULLIF(v_titular_row ->> 'estado', ''), 'activa'),
          num_miembros    = v_row_count,
          num_adultos     = v_num_adultos,
          num_menores_18  = v_num_menores,
          codigo_postal   = COALESCE(NULLIF(v_titular_row -> 'person' ->> 'codigo_postal', ''), codigo_postal),
          metadata        = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'updated_from', 'legacy_csv_v3',
            'updated_by', v_actor_id,
            'updated_at', now(),
            'updated_src_filename', p_src_filename
          ),
          updated_at = now()
        WHERE id = v_family_id;

        -- Titular: keep the existing titular_id; backfill person + ensure enrollment.
        IF v_titular_id IS NOT NULL THEN
          PERFORM backfill_legacy_person(v_titular_id, v_titular_row -> 'person');
          PERFORM upsert_familia_enrollment(v_titular_id, v_program_id, v_family_id, 0);
        END IF;

        -- Members: backfill existing (family-scoped match), add new.
        v_used_ids := ARRAY[]::uuid[];
        FOR j IN 0 .. v_row_count - 1 LOOP
          IF j = v_titular_index THEN CONTINUE; END IF;
          v_dep_row := (v_group -> 'rows') -> j;
          v_doc := NULLIF(v_dep_row -> 'person' ->> 'numero_documento', '');
          v_member_id := NULL;
          v_member_person := NULL;

          -- 1. Match within THIS family by document (strong).
          IF v_doc IS NOT NULL THEN
            SELECT fm.id, fm.person_id INTO v_member_id, v_member_person
            FROM familia_miembros fm
            LEFT JOIN persons p ON p.id = fm.person_id
            WHERE fm.familia_id = v_family_id
              AND fm.deleted_at IS NULL
              AND fm.id <> ALL(v_used_ids)
              AND (fm.documento = v_doc OR p.numero_documento = v_doc)
            LIMIT 1;
          END IF;

          -- 2. Else family-scoped name+DOB (safe within one family).
          IF v_member_id IS NULL THEN
            SELECT fm.id, fm.person_id INTO v_member_id, v_member_person
            FROM familia_miembros fm
            WHERE fm.familia_id = v_family_id
              AND fm.deleted_at IS NULL
              AND fm.id <> ALL(v_used_ids)
              AND lower(fm.nombre) = lower(v_dep_row -> 'person' ->> 'nombre')
              AND lower(COALESCE(fm.apellidos, '')) = lower(COALESCE(v_dep_row -> 'person' ->> 'apellidos', ''))
              AND fm.fecha_nacimiento IS NOT DISTINCT FROM
                  NULLIF(v_dep_row -> 'person' ->> 'fecha_nacimiento', '')::date
            LIMIT 1;
          END IF;

          IF v_member_id IS NOT NULL THEN
            v_used_ids := array_append(v_used_ids, v_member_id);
            -- Existing member: backfill member row + person, ensure enrollment.
            UPDATE familia_miembros SET
              documento = COALESCE(NULLIF(documento, ''), v_doc),
              relacion = CASE
                WHEN (relacion IS NULL OR relacion IN ('other', 'otro'))
                     AND (v_dep_row ->> 'relacion_db') NOT IN ('other', 'otro')
                THEN v_dep_row ->> 'relacion_db' ELSE relacion END,
              updated_at = now()
            WHERE id = v_member_id;
            IF v_member_person IS NOT NULL THEN
              PERFORM backfill_legacy_person(v_member_person, v_dep_row -> 'person');
              PERFORM upsert_familia_enrollment(v_member_person, v_program_id, v_family_id, j);
            END IF;
          ELSE
            -- New member.
            v_dep_person_id := upsert_legacy_person(v_dep_row -> 'person');
            INSERT INTO familia_miembros (
              familia_id, person_id, nombre, apellidos, rol, relacion,
              fecha_nacimiento, documento, estado
            ) VALUES (
              v_family_id, v_dep_person_id,
              v_dep_row -> 'person' ->> 'nombre',
              v_dep_row -> 'person' ->> 'apellidos',
              'dependent',
              v_dep_row ->> 'relacion_db',
              NULLIF(v_dep_row -> 'person' ->> 'fecha_nacimiento', '')::date,
              NULLIF(v_dep_row -> 'person' ->> 'numero_documento', ''),
              CASE WHEN (v_dep_row ->> 'estado') = 'baja' THEN 'baja' ELSE 'activo' END
            )
            RETURNING id INTO v_member_id;
            v_used_ids := array_append(v_used_ids, v_member_id);
            PERFORM upsert_familia_enrollment(v_dep_person_id, v_program_id, v_family_id, j);
          END IF;
        END LOOP;

        INSERT INTO family_legacy_import_audit(
          actor_id, family_id, legacy_numero, operation, row_count, src_filename
        ) VALUES (
          v_actor_id, v_family_id, v_legacy_num, 'updated', v_row_count, p_src_filename
        );
        v_updated := v_updated + 1;
        CONTINUE;
      END IF;

      -- ── CREATE branch (new family) ─────────────────────────────────────────
      v_titular_id := upsert_legacy_person(v_titular_row -> 'person');

      INSERT INTO families (
        titular_id, legacy_numero, fecha_alta, estado,
        num_miembros, num_adultos, num_menores_18, codigo_postal,
        persona_recoge, metadata
      ) VALUES (
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

      -- Enroll titular.
      PERFORM upsert_familia_enrollment(v_titular_id, v_program_id, v_family_id, 0);

      -- Insert + enroll dependents.
      FOR j IN 0 .. v_row_count - 1 LOOP
        IF j = v_titular_index THEN CONTINUE; END IF;
        v_dep_row := (v_group -> 'rows') -> j;
        v_dep_person_id := upsert_legacy_person(v_dep_row -> 'person');

        INSERT INTO familia_miembros (
          familia_id, person_id, nombre, apellidos, rol, relacion,
          fecha_nacimiento, documento, estado
        ) VALUES (
          v_family_id, v_dep_person_id,
          v_dep_row -> 'person' ->> 'nombre',
          v_dep_row -> 'person' ->> 'apellidos',
          'dependent',
          v_dep_row ->> 'relacion_db',
          NULLIF(v_dep_row -> 'person' ->> 'fecha_nacimiento', '')::date,
          NULLIF(v_dep_row -> 'person' ->> 'numero_documento', ''),
          CASE WHEN (v_dep_row ->> 'estado') = 'baja' THEN 'baja' ELSE 'activo' END
        );
        PERFORM upsert_familia_enrollment(v_dep_person_id, v_program_id, v_family_id, j);
      END LOOP;

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
    'updated_count', v_updated,
    'skipped_count', v_skipped,
    'error_count',   v_errors,
    'error_details', v_error_list,
    'enrollment_program_missing', v_enrollment_missing
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_legacy_familias_import(uuid, text, text, text[]) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_legacy_familias_import(uuid, text, text, text[]) TO authenticated;
