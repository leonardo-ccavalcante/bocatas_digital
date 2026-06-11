-- 20260611000002_recover_prod_schema_gap.sql
--
-- RECOVERY migration (mythos/wave-1, 2026-06-11) — closes the concrete prod/repo
-- migration gap surfaced by regenerating database.types.ts and diffing the repo
-- migration chain against the LIVE production schema (project vqvgcsdvvgyubqxumlwn)
-- via the Supabase MCP. Every shape below is copied from prod (the source of
-- truth), NOT guessed.
--
-- The repo migration chain is missing one table and six columns that PROD has
-- and that the application code + committed database.types.ts already depend on.
-- A fresh `supabase db reset` therefore built a schema the code can't typecheck
-- against; `pnpm check` only passed because the committed (prod-generated) types
-- carried the columns the migrations never created. This is the "~30 prod
-- migrations missing from repo" gap, made concrete and (for these surfaces)
-- closed.
--
-- All statements are idempotent (IF NOT EXISTS) so this is a safe no-op on prod
-- and on any environment that already has these objects.

-- ── 1. Missing table: legacy_import_sessions ─────────────────────────────────
-- Exact prod shape (information_schema + pg_index): id PK uuid, counts NOT NULL
-- DEFAULT 0, ts NOT NULL DEFAULT now(); RLS enabled with NO policies (deny-all
-- to anon/authenticated; service_role/postgres bypass) — matches prod exactly.
CREATE TABLE IF NOT EXISTS public.legacy_import_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id text NOT NULL,
  actor_name text,
  src_filename text,
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  report_url text,
  ts timestamptz NOT NULL DEFAULT now(),
  preview_token uuid
);
ALTER TABLE public.legacy_import_sessions ENABLE ROW LEVEL SECURITY;

-- ── 2. derivacion_intervenciones: exclude-intervention columns ───────────────
-- prod: excluded_by is TEXT (an actor id string), NOT uuid. Used by
-- server/routers/derivar/intervenciones.ts.
ALTER TABLE public.derivacion_intervenciones
  ADD COLUMN IF NOT EXISTS excluded_at timestamptz,
  ADD COLUMN IF NOT EXISTS excluded_by text,
  ADD COLUMN IF NOT EXISTS excluded_reason text;

-- ── 3. derivacion_hojas: signed-sheet columns ────────────────────────────────
ALTER TABLE public.derivacion_hojas
  ADD COLUMN IF NOT EXISTS firmado_at timestamptz,
  ADD COLUMN IF NOT EXISTS firmado_url text;

-- ── 4. bulk_import_previews: source filename ─────────────────────────────────
ALTER TABLE public.bulk_import_previews
  ADD COLUMN IF NOT EXISTS src_filename text;
