-- Audit log for announcement field changes
-- Tracks who changed what and when for post-hoc forensics

CREATE TABLE IF NOT EXISTS announcement_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  edited_by uuid NOT NULL,
  edited_at timestamptz NOT NULL DEFAULT now(),
  field text NOT NULL,
  old_value jsonb,
  new_value jsonb
);

-- Index for viewing change history by announcement
CREATE INDEX IF NOT EXISTS idx_announcement_audit_log_by_announcement
  ON announcement_audit_log (announcement_id, edited_at DESC);

-- Index for finding changes by a specific user
CREATE INDEX IF NOT EXISTS idx_announcement_audit_log_by_editor
  ON announcement_audit_log (edited_by, edited_at DESC);
