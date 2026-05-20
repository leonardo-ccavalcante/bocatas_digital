-- ============================================================================
-- 20260520000002_capture_announcements_deleted_at_from_prod.sql
--
-- CANONICAL — captures announcements.deleted_at column from prod (Kind B
-- follow-up to 20260520000001).
--
-- BACKGROUND
--
--   The base CREATE TABLE in 20260501000001_create_announcements_table.sql
--   does NOT include a deleted_at column. But the committed
--   database.types.ts (generated from prod at some point) DOES have
--   announcements.deleted_at: string | null. This means prod added the
--   column via an ALTER TABLE that was never re-exported to the repo —
--   another instance of the gap documented in EXPORTED/README.md.
--
--   The types-drift gate fails because local gen doesn't have the column
--   while committed does. Capture in repo migrations so local mirrors
--   prod.
--
-- WHY ADD A PARTIAL INDEX
--
--   Every other table in this repo with deleted_at carries an index on
--   it WHERE deleted_at IS NOT NULL. The announcements router likely
--   filters by `deleted_at IS NULL` on every list — the partial index
--   keeps that filter cheap as the table grows.
--
-- IDEMPOTENCY
--
--   ADD COLUMN IF NOT EXISTS is no-op against prod (column exists)
--   and creates fresh in CI/local.
-- ============================================================================

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_announcements_deleted_at
  ON public.announcements (deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN public.announcements.deleted_at IS
  'Soft-delete timestamp. NULL = active. Captured from prod 2026-05-20.';
