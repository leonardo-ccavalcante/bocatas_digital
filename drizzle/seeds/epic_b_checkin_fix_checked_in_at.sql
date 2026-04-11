-- Epic B: Fix — Add checked_in_at timestamp field to attendances table
-- Applied to Supabase project vqvgcsdvvgyubqxumlwn on 2026-04-11
-- Run via Supabase MCP execute_sql (service role)

-- ── Add checked_in_at column if it doesn't exist ────────────────────────────────
ALTER TABLE attendances
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- ── Create index for performance (duplicate detection queries) ───────────────────
CREATE INDEX IF NOT EXISTS attendances_person_location_programa_date_idx
  ON attendances(person_id, location_id, programa, checked_in_date)
  WHERE deleted_at IS NULL;
