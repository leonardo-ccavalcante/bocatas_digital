-- 20260612000001_recover_consents_person_purpose_unique.sql
--
-- POS-01 (Mythos audit, P0) — also a prod/repo migration-chain gap.
--
-- `server/routers/persons/consents.ts` upserts with
-- `.upsert(rows, { onConflict: "person_id,purpose" })`. PROD has a matching
-- UNIQUE constraint `consents_person_id_purpose_unique UNIQUE (person_id, purpose)`
-- (verified live via MCP), so the upsert works there. But NO repo migration
-- creates it — so on every fresh environment (CI ephemeral DB, staging, new dev)
-- the upsert fails at plan time with:
--
--     ERROR: there is no unique or exclusion constraint matching the
--            ON CONFLICT specification  (SQLSTATE 42P10)
--
-- i.e. recording legal consent (Grupo-A `tratamiento_datos_bocatas`, etc.) is
-- broken at runtime in any environment built from the repo. Reproduced on a
-- fresh `supabase db reset`.
--
-- Recovers the constraint to match prod EXACTLY:
--   * NON-partial UNIQUE (covers soft-deleted rows too). A *partial* unique index
--     (... WHERE deleted_at IS NULL) is NOT inferable by PostgREST's `onConflict=`
--     (it emits no predicate), so it would NOT fix the 42P10 — see ADR-0007.
--     Prod's constraint is non-partial; this matches it.
--   * Prod has 0 (person_id, purpose) duplicate rows (verified), so it applies
--     cleanly with no dedup. Idempotent guard so it is a no-op where prod (or a
--     prior apply) already created it.
--
-- The partial perf index `idx_consents_person_purpose (person_id, purpose)
-- WHERE deleted_at IS NULL` already exists in the repo chain (unchanged here).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.consents'::regclass
      AND conname = 'consents_person_id_purpose_unique'
  ) THEN
    ALTER TABLE public.consents
      ADD CONSTRAINT consents_person_id_purpose_unique UNIQUE (person_id, purpose);
  END IF;
END $$;
