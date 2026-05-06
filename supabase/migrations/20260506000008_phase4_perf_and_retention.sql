-- 20260506000008_phase4_perf_and_retention.sql
-- Phase 4: missing index + jsonb cap + pg_cron retention jobs.
--
-- Closes:
--   M-2 (last item): index on persons.canal_llegada (the only one not yet in prod;
--        program_enrollments.person_id, announcement_dismissals.person_id, and
--        familia_miembros.person_id were all already indexed)
--   H-10: 90-day retention for announcement_audit_log + announcement_webhook_log
--   H-11: cap bulk_import_previews.parsed_rows array length at 10000

BEGIN;

-- M-2 — persons.canal_llegada filter index (used by dashboard breakdown + ad-hoc reports)
CREATE INDEX IF NOT EXISTS idx_persons_canal_llegada
  ON public.persons (canal_llegada)
  WHERE deleted_at IS NULL;

-- H-11 — cap parsed_rows length. 10k rows is far beyond any realistic single-import batch
-- (CSV at 10k rows × ~500 bytes/row = ~5MB). Above that, operator splits the import.
ALTER TABLE public.bulk_import_previews
  ADD CONSTRAINT bulk_import_previews_parsed_rows_max
  CHECK (jsonb_array_length(parsed_rows) <= 10000);

-- H-10 — pg_cron retention jobs.
-- Supabase ships pg_cron in the 'extensions' schema and grants USAGE to postgres only.
-- The cron.schedule() RPC stores jobs in cron.job; the executor runs them as the
-- Supabase cron worker.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Daily prune at 03:00 UTC (off-peak across EU + Americas)
SELECT cron.schedule(
  'prune-announcement-audit-log',
  '0 3 * * *',
  $$DELETE FROM public.announcement_audit_log WHERE edited_at < now() - interval '90 days'$$
);

-- Daily prune at 03:05 UTC (offset from audit-log to avoid simultaneous writes)
SELECT cron.schedule(
  'prune-announcement-webhook-log',
  '5 3 * * *',
  $$DELETE FROM public.announcement_webhook_log WHERE attempted_at < now() - interval '90 days'$$
);

COMMIT;
