-- Migration: Create find_duplicate_persons RPC function
-- Uses pg_trgm similarity for fuzzy name matching
-- Returns candidates with similarity >= threshold (default 0.70)

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

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION find_duplicate_persons(TEXT, TEXT, FLOAT) TO authenticated;
