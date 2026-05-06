-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260504184659 — name: add_announcements_columns

ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS es_urgente boolean NOT NULL DEFAULT false;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS fijado boolean NOT NULL DEFAULT false;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS audiences jsonb;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS image_url text;
