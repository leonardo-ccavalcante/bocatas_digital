-- Add deleted_at column to familia_miembros for parity with families table.
-- Code in families.ts (lines 235, 1179, 1384) filters by .is("deleted_at", null)
-- but the column was missing from the live schema, causing those queries to
-- fail at runtime — silently in line 235's catch handler (modal showed 0
-- members for any family) and noisily in the bulk import / CSV export paths.
--
-- This migration only adds the column. Soft-delete behavior (changing
-- deleteMember to set deleted_at instead of DELETE) is intentionally NOT
-- changed here — current hard-delete UX is preserved. Adding the column
-- makes the existing filter functional (returns all rows since none have
-- deleted_at set) without any behavioral change.
--
-- DATABASE_SCHEMA_FIX.md described this fix as already applied; turns out
-- it never was. This migration makes that doc accurate.

ALTER TABLE public.familia_miembros
  ADD COLUMN IF NOT EXISTS deleted_at timestamp without time zone NULL;

CREATE INDEX IF NOT EXISTS idx_familia_miembros_deleted_at
  ON public.familia_miembros(deleted_at);
