-- Dismissals: tracks which users have dismissed which announcements (for banner)
-- Webhook log: audit trail for urgent announcement webhook attempts

-- Dismissals table with composite primary key (no separate id needed)
CREATE TABLE IF NOT EXISTS announcement_dismissals (
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  person_id uuid NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, person_id)
);

-- Index for querying dismissals by person (e.g., "which have I dismissed?")
CREATE INDEX IF NOT EXISTS idx_announcement_dismissals_by_person
  ON announcement_dismissals (person_id);

-- Webhook log for urgent announcement delivery attempts
CREATE TABLE IF NOT EXISTS announcement_webhook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  status_code int,
  response_body text,
  error text
);

-- Index for viewing webhook attempts by announcement
CREATE INDEX IF NOT EXISTS idx_announcement_webhook_log_by_announcement
  ON announcement_webhook_log (announcement_id, attempted_at DESC);
