-- Atomic confirm step for the legacy FAMILIAS CSV importer.
--
-- Reads a preview from `bulk_import_previews`, then iterates the family
-- groups committing each one within its own plpgsql sub-transaction
-- (BEGIN ... EXCEPTION block — implicit savepoint, NOT a named SAVEPOINT
-- statement; see PostgreSQL docs on PL/pgSQL Trapping Errors). Each family
-- ends as one of:
--   * `created`           → family + persons + familia_miembros + audit row inserted
--   * `skipped_duplicate` → families.legacy_numero already exists, skip + audit row
--   * `failed`            → sub-transaction rolled back, sanitized error captured + audit row
--
-- Per-family granularity matches the operator's mental model: 49 of 50
-- families import even if 1 has a constraint violation.
--
-- Security posture:
--   * Function is SECURITY DEFINER so it can write across tables whose
--     RLS would block direct INSERTs from the caller (audit table, persons
--     dedup, etc.). To prevent any authenticated user from calling the
--     RPC directly via PostgREST and bypassing the tRPC adminProcedure
--     gate, the function performs an explicit role check on the caller's
--     JWT and a strict EXECUTE grant.
--   * Caller identity is taken from `auth.uid()` inside the function —
--     not from a parameter — so no caller can spoof the actor recorded
--     in the audit log.
--   * `upsert_legacy_person` is an internal helper; EXECUTE is revoked
--     from `authenticated` so it cannot be called directly even by an
--     admin (the only legal path is via `confirm_legacy_familias_import`).

CREATE OR REPLACE FUNCTION public.upsert_legacy_person(p_person jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_new_id uuid;
  v_genero genero;
  v_tipo_documento tipo_documento;
  v_nivel_estudios nivel_estudios;
  v_situacion_laboral situacion_laboral;
  v_fecha_nacimiento date;
BEGIN
  v_fecha_nacimiento := NULLIF(p_person ->> 'fecha_nacimiento', '')::date;

  IF v_fecha_nacimiento IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM persons
    WHERE nombre = (p_person ->> 'nombre')
      AND apellidos = (p_person ->> 'apellidos')
      AND fecha_nacimiento = v_fecha_nacimiento
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
    NULLIF(p_person ->> 'numero_documento', ''),
    v_nivel_estudios,
    v_situacion_laboral,
    NULLIF(p_person ->> 'observaciones', ''),
    'programa_familias'::canal_llegada,
    'es'::idioma,
    COALESCE(p_person -> 'metadata', '{}'::jsonb)
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_legacy_person(jsonb) IS
  'Internal helper for confirm_legacy_familias_import: dedup-or-insert a persons row from a legacy CSV mapper output. Not callable by application code.';

-- Strip the implicit PUBLIC + authenticated grants. The helper is reachable
-- only from confirm_legacy_familias_import, which itself runs SECURITY DEFINER.
REVOKE EXECUTE ON FUNCTION public.upsert_legacy_person(jsonb) FROM PUBLIC, authenticated;


-- ─── Sanitiser for audit-trail error messages ─────────────────────────────
-- SQLERRM from constraint violations can include the offending value,
-- e.g. `invalid input value for enum tipo_documento: "NIE_EXPIRED"` or
-- `duplicate key value violates ... (numero_documento)=(12345678A)`.
-- These echo PII into family_legacy_import_audit.notes and the RPC return
-- payload. Strip parenthesised values + quoted values + numeric runs of
-- 6+ digits before storing.

CREATE OR REPLACE FUNCTION public.sanitize_audit_error(p_msg text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    -- 6+ digit runs (likely DNI/phone) → ******
    regexp_replace(
      -- Quoted string values → "***"
      regexp_replace(
        -- "(...)=(...)" segments common to constraint errors → "(redacted)"
        regexp_replace(COALESCE(p_msg, ''), '\([^)]*\)=\([^)]*\)', '(redacted)', 'g'),
        '"[^"]*"', '"***"', 'g'
      ),
      '\d{6,}', '******', 'g'
    );
$$;

COMMENT ON FUNCTION public.sanitize_audit_error(text) IS
  'Strips potentially-PII fragments from a Postgres SQLERRM before persistence in the audit log.';

REVOKE EXECUTE ON FUNCTION public.sanitize_audit_error(text) FROM PUBLIC, authenticated;


-- ─── Main RPC ─────────────────────────────────────────────────────────────

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
  v_created      int := 0;
  v_skipped      int := 0;
  v_errors       int := 0;
  v_error_list   jsonb := '[]'::jsonb;
  v_safe_errmsg  text;
BEGIN
  -- Defense-in-depth role gate. The tRPC adminProcedure already enforces
  -- this at the API layer; the SECURITY DEFINER context plus a direct
  -- supabase.rpc() call from a non-admin would otherwise bypass it.
  v_role := public.get_user_role();
  IF v_role NOT IN ('superadmin', 'admin') THEN
    RAISE EXCEPTION 'forbidden: legacy import requires admin role'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  -- Caller is identified strictly by JWT, not by a parameter, to prevent
  -- audit-log impersonation.
  v_actor_id := COALESCE(auth.uid()::text, '');
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

  FOR i IN 0 .. jsonb_array_length(v_groups) - 1 LOOP
    v_group := v_groups -> i;
    v_legacy_num := v_group ->> 'legacy_numero_familia';
    v_titular_index := (v_group ->> 'titular_index')::int;
    v_row_count := jsonb_array_length(v_group -> 'rows');

    -- Implicit savepoint via plpgsql sub-transaction (BEGIN/EXCEPTION),
    -- not a named SAVEPOINT statement.
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

      -- 2. Insert / resolve titular person.
      v_titular_row := (v_group -> 'rows') -> v_titular_index;
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
    'created_count', v_created,
    'skipped_count', v_skipped,
    'error_count',   v_errors,
    'errors',        v_error_list
  );
END;
$$;

COMMENT ON FUNCTION public.confirm_legacy_familias_import(uuid, text) IS
  'Atomically commits a legacy FAMILIAS CSV import preview. Per-family savepoints; idempotent on families.legacy_numero. Caller identity taken from auth.uid(); admin/superadmin role required.';

-- Strip any inherited PUBLIC / authenticated grant, then issue an explicit
-- one for `authenticated`. Combined with the in-function role check, this
-- means an authenticated low-privilege user can call the RPC but receives
-- a `forbidden` error before any DML runs.
REVOKE EXECUTE ON FUNCTION public.confirm_legacy_familias_import(uuid, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_legacy_familias_import(uuid, text) TO authenticated;
