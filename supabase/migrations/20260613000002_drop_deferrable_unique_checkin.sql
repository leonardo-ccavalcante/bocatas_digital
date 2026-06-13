-- Migration: drop the deferrable unique constraint on attendances
-- that was blocking ON CONFLICT upserts.
--
-- Background (POS-02 / 20260612000003):
--   20260612000003 added a non-deferrable unique index
--   (attendances_checkin_upsert_arbiter) so that ON CONFLICT clauses can
--   target it. However Postgres 15 raises error 55000 ("cannot use a
--   deferrable unique constraint for ON CONFLICT") whenever *any* unique
--   constraint on the same column set is deferrable — even if the ON CONFLICT
--   clause targets a different, non-deferrable index.
--
--   The original attendances_unique_checkin constraint was DEFERRABLE
--   INITIALLY DEFERRED (created in 20260410120900). Dropping it removes the
--   ambiguity and lets the upsert arbiter index do its job.
--
-- Safety: the non-deferrable arbiter index enforces the same uniqueness
-- guarantee at statement level, which is sufficient for all current use-cases.
-- No application code relies on deferred constraint checking for attendances.

ALTER TABLE attendances
  DROP CONSTRAINT IF EXISTS attendances_unique_checkin;
