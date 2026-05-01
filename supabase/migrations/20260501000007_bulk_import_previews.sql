-- Temporary storage for bulk import preview data
-- Rows are filtered by created_at > now() - interval '30 minutes' at query time (TTL)

CREATE TABLE IF NOT EXISTS bulk_import_previews (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parsed_rows jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for TTL filtering and cleanup
CREATE INDEX IF NOT EXISTS idx_bulk_import_previews_created_at
  ON bulk_import_previews (created_at);

-- RLS: only the creator (who must be admin/superadmin) can access their preview
ALTER TABLE bulk_import_previews ENABLE ROW LEVEL SECURITY;

-- SELECT: only own rows and only if admin/superadmin
DROP POLICY IF EXISTS bulk_import_previews_own_select ON bulk_import_previews;
CREATE POLICY bulk_import_previews_own_select ON bulk_import_previews
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()::text
    AND public.get_user_role() IN ('superadmin', 'admin')
  );

-- INSERT: admin/superadmin only, must be own row
DROP POLICY IF EXISTS bulk_import_previews_own_insert ON bulk_import_previews;
CREATE POLICY bulk_import_previews_own_insert ON bulk_import_previews
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()::text
    AND public.get_user_role() IN ('superadmin', 'admin')
  );

-- DELETE: admin/superadmin only, own rows (for cleanup after confirm)
DROP POLICY IF EXISTS bulk_import_previews_own_delete ON bulk_import_previews;
CREATE POLICY bulk_import_previews_own_delete ON bulk_import_previews
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()::text
    AND public.get_user_role() IN ('superadmin', 'admin')
  );
