-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260501131457 — name: fix_autor_id_and_edited_by_uuid_to_text

ALTER TABLE public.announcements
  ALTER COLUMN autor_id TYPE text
  USING autor_id::text;

ALTER TABLE public.announcement_audit_log
  ALTER COLUMN edited_by TYPE text
  USING edited_by::text;
