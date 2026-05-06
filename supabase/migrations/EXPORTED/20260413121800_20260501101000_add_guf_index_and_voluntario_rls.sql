-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260413121800 — name: 20260501101000_add_guf_index_and_voluntario_rls

CREATE INDEX IF NOT EXISTS idx_families_guf_verified_at
  ON families (guf_verified_at)
  WHERE estado = 'activa' AND deleted_at IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'families' AND policyname = 'families_voluntario_select'
  ) THEN
    CREATE POLICY families_voluntario_select ON families
      FOR SELECT TO authenticated
      USING (get_user_role() IN ('voluntario','admin','superadmin')
             AND estado = 'activa' AND deleted_at IS NULL);
  END IF;
END $$;
