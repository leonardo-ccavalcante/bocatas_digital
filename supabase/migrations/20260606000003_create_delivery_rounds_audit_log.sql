-- Migration: create delivery_rounds_audit_log
-- Stores an immutable audit trail for destructive actions on delivery_rounds.
-- Rows are append-only (no UPDATE/DELETE allowed via RLS).

CREATE TABLE IF NOT EXISTS delivery_rounds_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action        TEXT NOT NULL,           -- e.g. 'delete_round'
  round_id      UUID NOT NULL,           -- the affected delivery_round id
  round_nombre  TEXT,                    -- snapshot of round name at time of action
  round_estado  TEXT,                    -- snapshot of round estado at time of action
  actor_id      TEXT NOT NULL,           -- Manus user open_id of the admin who performed the action
  actor_name    TEXT,                    -- display name snapshot
  metadata      JSONB DEFAULT '{}',      -- any extra context (program_id, etc.)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying by round_id (e.g. audit trail for a specific round)
CREATE INDEX IF NOT EXISTS idx_audit_log_round_id
  ON delivery_rounds_audit_log (round_id);

-- Index for querying by actor (e.g. all actions by a specific admin)
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id
  ON delivery_rounds_audit_log (actor_id);

-- RLS: service role can insert; no one can update or delete rows.
ALTER TABLE delivery_rounds_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_insert_audit_log"
  ON delivery_rounds_audit_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "service_role_select_audit_log"
  ON delivery_rounds_audit_log
  FOR SELECT
  TO service_role
  USING (true);
