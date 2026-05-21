-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260501123946 — name: fix_bulk_import_created_by_type

DROP POLICY IF EXISTS bulk_import_previews_own_select ON bulk_import_previews;
DROP POLICY IF EXISTS bulk_import_previews_own_insert ON bulk_import_previews;
DROP POLICY IF EXISTS bulk_import_previews_own_delete ON bulk_import_previews;

ALTER TABLE bulk_import_previews ALTER COLUMN created_by TYPE text;

CREATE POLICY bulk_import_previews_own_select ON bulk_import_previews
  FOR SELECT TO authenticated
  USING (created_by = auth.uid()::text AND public.get_user_role() IN ('superadmin', 'admin'));

CREATE POLICY bulk_import_previews_own_insert ON bulk_import_previews
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid()::text AND public.get_user_role() IN ('superadmin', 'admin'));

CREATE POLICY bulk_import_previews_own_delete ON bulk_import_previews
  FOR DELETE TO authenticated
  USING (created_by = auth.uid()::text AND public.get_user_role() IN ('superadmin', 'admin'));
