-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260411181059 — name: 20260411140010_create_duplicate_check_rpc

CREATE OR REPLACE FUNCTION find_duplicate_persons(
  p_nombre    TEXT,
  p_apellidos TEXT,
  p_threshold FLOAT DEFAULT 0.70
)
RETURNS TABLE (
  id                UUID,
  nombre            TEXT,
  apellidos         TEXT,
  fecha_nacimiento  DATE,
  foto_perfil_url   TEXT,
  similarity        FLOAT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    p.id,
    p.nombre,
    p.apellidos,
    p.fecha_nacimiento,
    p.foto_perfil_url,
    GREATEST(
      similarity(p.nombre, p_nombre),
      similarity(COALESCE(p.apellidos, ''), p_apellidos),
      similarity(
        p.nombre || ' ' || COALESCE(p.apellidos, ''),
        p_nombre || ' ' || p_apellidos
      )
    ) AS similarity
  FROM persons p
  WHERE p.deleted_at IS NULL
    AND (
      similarity(p.nombre, p_nombre) >= p_threshold
      OR similarity(COALESCE(p.apellidos, ''), p_apellidos) >= p_threshold
      OR similarity(
        p.nombre || ' ' || COALESCE(p.apellidos, ''),
        p_nombre || ' ' || p_apellidos
      ) >= p_threshold
    )
  ORDER BY similarity DESC
  LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION find_duplicate_persons(TEXT, TEXT, FLOAT) TO authenticated;
