-- Migration: rename programs.slug 'familia' → 'programa_familias'
--
-- Root cause: the programs table was seeded with slug='familia' but the
-- PR #41 frontend hardcodes slug='programa_familias' throughout:
--   - App.tsx redirects
--   - ProgramTabs.tsx guard
--   - ProgramaDetalle.tsx conditional
--   - Migrations 20260506210007 and 20260601000007 seeds
--
-- Fix: rename the slug in the DB to match the frontend expectation.
-- This is a one-way migration — no rollback needed (the old slug 'familia'
-- was never exposed to end users; it was an internal seed value).

UPDATE programs
SET slug = 'programa_familias'
WHERE slug = 'familia';

-- Verify the rename succeeded (will raise if row not found)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM programs WHERE slug = 'programa_familias') THEN
    RAISE EXCEPTION 'Migration failed: programa_familias slug not found after rename';
  END IF;
END $$;
