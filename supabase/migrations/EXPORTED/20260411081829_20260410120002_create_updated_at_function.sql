-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260411081829 — name: 20260410120002_create_updated_at_function

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
