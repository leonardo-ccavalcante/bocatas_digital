-- ============================================================================
-- 20260512000001_create_family_webhook_log.sql
--
-- PENDING REVIEW — DO NOT APPLY WITHOUT EIPD UPDATE.
--
-- Purpose
--   Append-only audit ledger for the 5 family lifecycle webhooks emitted to
--   Chatwoot/n8n by `server/familyEvents.ts` (Phase B.7). Mirrors the
--   `announcement_webhook_log` table introduced in
--   20260501000005_announcement_dismissals_and_webhook_log.sql.
--
--   Logged events (versioned `v1`):
--     - family.created
--     - family.deactivated
--     - family.delivery.recorded
--     - family.compliance.alert
--     - family.session.closed
--
-- WHY THIS IS NOT APPLIED YET
--   1. EIPD update: the EIPD must list `family_webhook_log` as a processing
--      record before the table is created in production. The log row holds
--      no PII (response bodies are truncated and family_id is an opaque
--      UUID), but the table itself is a new processing surface.
--   2. RLS: only superadmin should SELECT — webhook URLs and response
--      bodies may carry deployment internals. RLS policies are declared
--      below but must be reviewed alongside the existing
--      `announcement_webhook_log` policies for consistency.
--
-- ROLLBACK / DOWN
--   To revert (drop the audit table and its index):
--
--     DROP INDEX IF EXISTS public.idx_family_webhook_log_by_family;
--     DROP TABLE IF EXISTS public.family_webhook_log;
--
-- ============================================================================

-- Step 1 — Audit table. Append-only by RLS policy below.
CREATE TABLE IF NOT EXISTS family_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_code INT,
  response_body TEXT,
  error TEXT
);

-- Step 2 — Lookup index for "what happened to this family?" reports.
CREATE INDEX IF NOT EXISTS idx_family_webhook_log_by_family
  ON family_webhook_log (family_id, attempted_at DESC);

-- Step 3 — Index for filtering by event type across all families
-- (e.g., "every family.deactivated emit in the last 30 days").
CREATE INDEX IF NOT EXISTS idx_family_webhook_log_by_event
  ON family_webhook_log (event, attempted_at DESC);

-- Step 4 — Enable Row Level Security.
ALTER TABLE family_webhook_log ENABLE ROW LEVEL SECURITY;

-- Step 5 — Policies.
-- SELECT: superadmin only (response bodies + URLs may carry deployment
-- internals). Mirrors announcement_webhook_log_superadmin_select policy.
DROP POLICY IF EXISTS family_webhook_log_superadmin_select ON family_webhook_log;
CREATE POLICY family_webhook_log_superadmin_select ON family_webhook_log
  FOR SELECT
  TO superadmin_role
  USING (true);

-- No UPDATE / DELETE policies — append-only ledger.

-- Step 6 — Force PostgREST to reload its schema cache so the new table
-- is exposed via the REST API immediately after this migration runs.
NOTIFY pgrst, 'reload schema';
