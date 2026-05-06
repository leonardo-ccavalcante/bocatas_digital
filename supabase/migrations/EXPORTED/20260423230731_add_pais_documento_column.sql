-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260423230731 — name: add_pais_documento_column

ALTER TABLE persons ADD COLUMN IF NOT EXISTS pais_documento VARCHAR(2) NULL;
