-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260413121741 — name: 20260501100800_create_app_settings_guf_cutoff

CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'app_settings' AND policyname = 'app_settings_superadmin'
  ) THEN
    CREATE POLICY app_settings_superadmin ON app_settings
      FOR ALL TO authenticated
      USING (get_user_role() = 'superadmin');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'app_settings' AND policyname = 'app_settings_admin_read'
  ) THEN
    CREATE POLICY app_settings_admin_read ON app_settings
      FOR SELECT TO authenticated
      USING (get_user_role() IN ('admin', 'superadmin'));
  END IF;
END $$;

INSERT INTO app_settings (key, value, description) VALUES
  ('guf_default_cutoff_day', '20', 'Día de corte GUF por defecto (superadmin puede cambiar)')
ON CONFLICT (key) DO NOTHING;
