-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260413121828 — name: 20260501101100_create_storage_buckets

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('firmas-entregas', 'firmas-entregas', false, 2097152, ARRAY['image/png','image/jpeg']),
  ('documentos-fisicos-entregas', 'documentos-fisicos-entregas', false, 5242880, ARRAY['image/png','image/jpeg'])
ON CONFLICT (id) DO NOTHING;
