-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260501132517 — name: fix_programs_cast_v3
-- This is the latest version of confirm_bulk_announcement_import (replaces 20260501130454 confirm_bulk_import_fn_fix_tipo_cast).
-- Fix: cast COALESCE(...) result to programa[] explicitly when inserting into announcement_audiences.programs.

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
      INSERT INTO announcements (
        titulo, contenido, tipo, es_urgente,
        fecha_inicio, fecha_fin, fijado, autor_id, autor_nombre, activo
      ) VALUES (
        v_row ->> 'titulo',
        v_row ->> 'contenido',
        (v_row ->> 'tipo')::tipo_announcement,
        COALESCE((v_row ->> 'es_urgente')::boolean, false),
        CASE WHEN v_row ->> 'fecha_inicio' IS NOT NULL AND v_row ->> 'fecha_inicio' <> ''
          THEN (v_row ->> 'fecha_inicio')::timestamptz ELSE now() END,
        CASE WHEN v_row ->> 'fecha_fin' IS NOT NULL AND v_row ->> 'fecha_fin' <> ''
          THEN (v_row ->> 'fecha_fin')::timestamptz ELSE NULL END,
        COALESCE((v_row ->> 'fijado')::boolean, false),
        p_autor_id, p_autor_nombre, true
      )
      RETURNING * INTO v_announcement;

      FOR j IN 0 .. jsonb_array_length(v_row -> 'audiencias') - 1 LOOP
        v_audience := (v_row -> 'audiencias') -> j;

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
          COALESCE(v_audience_programs, '{}')::programa[]
        );
      END LOOP;

      INSERT INTO announcement_audit_log (
        announcement_id, edited_by, edited_at, field, old_value, new_value
      ) VALUES (
        v_announcement.id, p_autor_id, now(), 'created_via', NULL, '"bulk_import"'
      );

      v_created_count := v_created_count + 1;

    EXCEPTION WHEN OTHERS THEN
      RAISE;
    END;
  END LOOP;

  RETURN jsonb_build_object('created_count', v_created_count, 'error_count', v_error_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_bulk_announcement_import(uuid, text, text) TO authenticated;
