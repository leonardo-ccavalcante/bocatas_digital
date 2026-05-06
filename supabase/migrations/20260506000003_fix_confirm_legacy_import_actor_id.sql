-- Migration: 20260506000003_fix_confirm_legacy_import_actor_id
--
-- Problem: confirm_legacy_familias_import used `auth.uid()::text` to get the
-- caller identity. Supabase's auth.uid() function casts the JWT `sub` claim to
-- UUID (`sub::uuid`). Our app stores user IDs as numeric strings (e.g. "1"),
-- not UUIDs, so the cast fails with:
--   ERROR 22P02: invalid input syntax for type uuid: "1"
--
-- Fix: Replace `auth.uid()::text` with `(auth.jwt() ->> 'sub')` which reads
-- the `sub` claim directly as text without any UUID cast.
--
-- This is safe because:
--   1. The ownership check `created_by = v_actor_id` still works — both sides
--      are text and the preview was inserted with `created_by = String(user.id)`.
--   2. The audit log stores actor_id as text (no UUID constraint).
--   3. The role check uses get_user_role() → auth.jwt() -> 'app_metadata' ->> 'role'
--      which is unaffected by this change.

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
  v_role         text;
  v_actor_id     text;
  v_preview      bulk_import_previews%ROWTYPE;
  v_groups       jsonb;
  v_group        jsonb;
  v_row_count    int;
  v_titular_index int;
  v_titular_row  jsonb;
  v_dep_row      jsonb;
  v_legacy_num   text;
  v_created      int := 0;
  v_skipped      int := 0;
  v_errors       int := 0;
  v_error_list   jsonb := '[]'::jsonb;
  v_safe_errmsg  text;
  v_titular_id   uuid;
  v_family_id    uuid;
  v_dep_person_id uuid;
  j              int;
BEGIN
  -- Role check: only admin/superadmin may confirm imports.
  v_role := public.get_user_role();
  IF v_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'forbidden: legacy import requires admin role' USING ERRCODE = '42501';
  END IF;

  -- FIX: Use auth.jwt() ->> 'sub' instead of auth.uid()::text.
  -- auth.uid() casts sub to UUID which fails for numeric IDs like "1".
  v_actor_id := COALESCE(auth.jwt() ->> 'sub', '');
  IF v_actor_id = '' THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  -- Token + ownership + TTL. Ownership is enforced even though the tRPC
  -- pre-check already ran — defense in depth, and the column type is the
  -- same `text` we wrote at preview time.
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

  -- Process each family group in its own sub-transaction (savepoint).
  FOR i IN 0 .. jsonb_array_length(v_groups) - 1 LOOP
    v_group := v_groups -> i;
    v_legacy_num := v_group ->> 'legacy_numero_familia';
    v_row_count := jsonb_array_length(v_group -> 'rows');
    v_titular_index := COALESCE((v_group ->> 'titular_index')::int, 0);
    v_titular_row := (v_group -> 'rows') -> v_titular_index;

    BEGIN
      -- 1. Idempotency: skip if already imported.
      IF (v_group ->> 'family_already_imported')::boolean THEN
        v_skipped := v_skipped + 1;
        INSERT INTO family_legacy_import_audit (
          actor_id, family_id, legacy_numero, operation, row_count, src_filename
        ) VALUES (
          v_actor_id, NULL, v_legacy_num, 'skipped_duplicate', v_row_count, p_src_filename
        );
        CONTINUE;
      END IF;

      -- 2. Upsert titular person.
      v_titular_id := upsert_legacy_person(v_titular_row -> 'person');

      -- 3. Insert family.
      INSERT INTO families (
        titular_id,
        legacy_numero,
        fecha_alta,
        persona_recoge,
        metadata
      )
      VALUES (
        v_titular_id,
        v_legacy_num,
        COALESCE(NULLIF(v_titular_row ->> 'fecha_alta', '')::date, CURRENT_DATE),
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

      -- 4. Insert dependents.
      FOR j IN 0 .. v_row_count - 1 LOOP
        IF j = v_titular_index THEN CONTINUE; END IF;
        v_dep_row := (v_group -> 'rows') -> j;
        v_dep_person_id := upsert_legacy_person(v_dep_row -> 'person');

        INSERT INTO familia_miembros (
          family_id,
          person_id,
          es_titular,
          fecha_alta,
          fecha_nacimiento,
          numero_documento,
          estado
        ) VALUES (
          v_family_id,
          v_dep_person_id,
          false,
          COALESCE(NULLIF(v_dep_row ->> 'fecha_alta', '')::date, CURRENT_DATE),
          NULLIF(v_dep_row -> 'person' ->> 'fecha_nacimiento', '')::date,
          NULLIF(v_dep_row -> 'person' ->> 'numero_documento', ''),
          'activo'
        );
      END LOOP;

      -- 5. Audit success.
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

  -- One-use token: clean up regardless of success/error counts.
  DELETE FROM bulk_import_previews WHERE token = p_token;

  RETURN jsonb_build_object(
    'created', v_created,
    'skipped', v_skipped,
    'errors',  v_errors,
    'error_details', v_error_list
  );
END;
$$;

COMMENT ON FUNCTION public.confirm_legacy_familias_import(uuid, text) IS
  'Atomically commits a legacy FAMILIAS CSV import preview. Per-family savepoints; idempotent on families.legacy_numero. Caller identity taken from auth.jwt() ->> ''sub'' (not auth.uid() to avoid UUID cast failure for numeric IDs). Admin/superadmin role required.';
