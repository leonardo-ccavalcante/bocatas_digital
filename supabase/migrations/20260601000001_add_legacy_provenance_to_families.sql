-- Provenance for legacy "FAMILIAS" Excel/CSV import.
--
-- Each family imported from the legacy spreadsheet carries the original
-- "NUMERO FAMILIA BOCATAS" value so re-imports are idempotent and any
-- record can be traced back to its source row.
--
-- Index note: a partial UNIQUE index is added to enforce idempotency in a
-- single round-trip and protect against duplicate-import races. Supabase
-- migrations run inside a transaction so CONCURRENTLY is not available
-- here; the `families` table is operationally small enough that the
-- ShareLock window during index build is acceptable. If `families`
-- grows large in the future, recreate the index with CONCURRENTLY in a
-- standalone migration that is run outside the transactional path.

ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS legacy_numero TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS families_legacy_numero_uniq
  ON public.families (legacy_numero)
  WHERE legacy_numero IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.families.legacy_numero IS
  'Provenance from legacy FAMILIAS Excel (NUMERO FAMILIA BOCATAS column). Used as idempotency key for legacy CSV re-imports. NULL for families not sourced from the legacy system.';
