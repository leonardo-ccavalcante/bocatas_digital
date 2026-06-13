-- RPC: get_documentos_faltantes
-- Returns families that are missing at least one required document for a given programa.
-- Replaces the 3-step chained .in() queries in documentosFaltantes.ts that fail with
-- 200+ family_ids (HeadersOverflowError: URL exceeds 16KB PostgREST GET limit).
--
-- The CROSS JOIN with required document types produces one candidate (family, slug) pair
-- per combination. The NOT EXISTS subquery filters to only the missing ones.
-- array_agg groups the missing slugs per family into a text[] column.
--
-- Returns: family_id uuid, familia_numero integer, missing_slugs text[]
CREATE OR REPLACE FUNCTION get_documentos_faltantes(p_programa_id uuid)
RETURNS TABLE (
  family_id uuid,
  familia_numero integer,
  missing_slugs text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    f.id                                          AS family_id,
    f.familia_numero::integer                     AS familia_numero,
    array_agg(pdt.slug ORDER BY pdt.slug)         AS missing_slugs
  FROM families f
  CROSS JOIN (
    SELECT slug
    FROM program_document_types
    WHERE programa_id = p_programa_id
      AND is_required = true
      AND is_active  = true
  ) pdt
  WHERE f.estado     = 'activa'
    AND f.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM family_member_documents fmd
      WHERE fmd.family_id      = f.id
        AND fmd.documento_tipo = pdt.slug
        AND fmd.is_current     = true
        AND fmd.documento_url  IS NOT NULL
        AND fmd.deleted_at     IS NULL
    )
  GROUP BY f.id, f.familia_numero
  ORDER BY f.familia_numero;
$$;
