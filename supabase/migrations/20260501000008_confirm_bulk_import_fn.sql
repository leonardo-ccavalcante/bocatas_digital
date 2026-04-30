-- confirm_bulk_announcement_import
--
-- Atomically inserts N announcements + their audience rules + one audit row each
-- from the stashed preview in bulk_import_previews.
--
-- Semantics: all-or-nothing. If ANY individual INSERT fails (e.g. CHECK constraint
-- violation on tipo), the entire transaction rolls back and the function raises an
-- exception. The caller receives error_count = total rows and created_count = 0.
--
-- Arguments:
--   p_token       uuid — the bulk_import_previews.token to process
--   p_autor_id    text — Manus user ID (stored as string in announcements.autor_id)
--   p_autor_nombre text — display name from auth session

CREATE OR REPLACE FUNCTION public.confirm_bulk_announcement_import(
  p_token       uuid,
  p_autor_id    text,
  p_autor_nombre text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preview_row   bulk_import_previews%ROWTYPE;
  v_rows          jsonb;
  v_row           jsonb;
  v_announcement  announcements%ROWTYPE;
  v_audience      jsonb;
  v_audience_roles  text[];
  v_audience_programs text[];
  v_created_count integer := 0;
  v_error_count   integer := 0;
BEGIN
  -- Fetch preview (ownership enforced by RLS on bulk_import_previews).
  SELECT * INTO v_preview_row
  FROM bulk_import_previews
  WHERE token = p_token
    AND created_at > now() - interval '30 minutes';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'preview expired or not found';
  END IF;

  v_rows := v_preview_row.parsed_rows;

  FOR i IN 0 .. jsonb_array_length(v_rows) - 1 LOOP
    v_row := v_rows -> i;

    BEGIN
      -- Insert announcement row.
      INSERT INTO announcements (
        titulo,
        contenido,
        tipo,
        es_urgente,
        fecha_inicio,
        fecha_fin,
        fijado,
        autor_id,
        autor_nombre,
        activo
      ) VALUES (
        v_row ->> 'titulo',
        v_row ->> 'contenido',
        v_row ->> 'tipo',
        COALESCE((v_row ->> 'es_urgente')::boolean, false),
        CASE
          WHEN v_row ->> 'fecha_inicio' IS NOT NULL AND v_row ->> 'fecha_inicio' <> ''
          THEN (v_row ->> 'fecha_inicio')::timestamptz
          ELSE now()
        END,
        CASE
          WHEN v_row ->> 'fecha_fin' IS NOT NULL AND v_row ->> 'fecha_fin' <> ''
          THEN (v_row ->> 'fecha_fin')::timestamptz
          ELSE NULL
        END,
        COALESCE((v_row ->> 'fijado')::boolean, false),
        p_autor_id,
        p_autor_nombre,
        true
      )
      RETURNING * INTO v_announcement;

      -- Insert audience rows (audiencias is a jsonb array of {roles, programs} objects).
      FOR j IN 0 .. jsonb_array_length(v_row -> 'audiencias') - 1 LOOP
        v_audience := (v_row -> 'audiencias') -> j;

        -- Convert jsonb arrays to postgres text[].
        SELECT array_agg(elem #>> '{}')
        INTO v_audience_roles
        FROM jsonb_array_elements(COALESCE(v_audience -> 'roles', '[]'::jsonb)) AS elem;

        SELECT array_agg(elem #>> '{}')
        INTO v_audience_programs
        FROM jsonb_array_elements(COALESCE(v_audience -> 'programs', '[]'::jsonb)) AS elem;

        INSERT INTO announcement_audiences (announcement_id, roles, programs)
        VALUES (
          v_announcement.id,
          COALESCE(v_audience_roles, '{}'),
          COALESCE(v_audience_programs, '{}')
        );
      END LOOP;

      -- Write one audit row per imported announcement.
      INSERT INTO announcement_audit_log (
        announcement_id,
        edited_by,
        edited_at,
        field,
        old_value,
        new_value
      ) VALUES (
        v_announcement.id,
        p_autor_id,
        now(),
        'created_via',
        NULL,
        '"bulk_import"'
      );

      v_created_count := v_created_count + 1;

    EXCEPTION WHEN OTHERS THEN
      -- Roll back entire transaction on any row error (fail-the-batch semantics).
      RAISE;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'created_count', v_created_count,
    'error_count',   v_error_count
  );
END;
$$;

-- Grant EXECUTE to authenticated role so the tRPC admin procedure can call it.
GRANT EXECUTE ON FUNCTION public.confirm_bulk_announcement_import(uuid, text, text)
  TO authenticated;
