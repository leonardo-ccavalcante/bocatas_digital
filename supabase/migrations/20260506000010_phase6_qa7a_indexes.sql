-- 20260506000010_phase6_qa7a_indexes.sql
--
-- Phase 6 QA-7A: missing composite indexes identified by the W2-be audit
-- (docs/superpowers/findings/2026-05-06-W2-be.md).
--
-- F-108: announcement_dismissals(person_id, announcement_id)
--   Used by the visibility filter in announcements/reads.ts (banner +
--   list dedup) — currently only the single-column person_id index exists,
--   so every list-load reruns a partial seq-scan to confirm dismissal.
--
-- F-109: families(estado, deleted_at)
--   Used by the "active families" list. estado-only index exists; the
--   common predicate is `estado = 'activa' AND deleted_at IS NULL` and the
--   composite is the right shape per Postgres B-tree leaf ordering.
--
-- IF NOT EXISTS so re-running the migration is safe; CONCURRENTLY would
-- be ideal but Supabase migrations run inside a transaction. Tables are
-- small at this stage, so blocking is negligible.

CREATE INDEX IF NOT EXISTS idx_announcement_dismissals_person_announcement
  ON announcement_dismissals (person_id, announcement_id);

CREATE INDEX IF NOT EXISTS idx_families_estado_deleted_at
  ON families (estado, deleted_at);
