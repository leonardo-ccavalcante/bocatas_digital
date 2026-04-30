-- Create announcement_audiences table for multi-rule targeting
-- Replaces the simple roles_visibles text[] column with a proper M:N relationship

CREATE TABLE IF NOT EXISTS announcement_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  roles text[] NOT NULL DEFAULT '{}',
  programs programa[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for visibility join
CREATE INDEX IF NOT EXISTS idx_announcement_audiences_announcement_id
  ON announcement_audiences (announcement_id);

-- Backfill from roles_visibles then drop the column
-- Wrapped in a transaction for atomicity
BEGIN;

-- Only backfill if roles_visibles column still exists
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'announcements'
    AND column_name = 'roles_visibles'
  ) THEN
    -- Insert audience rules from existing roles_visibles
    INSERT INTO announcement_audiences (announcement_id, roles, programs)
    SELECT id, COALESCE(roles_visibles, '{}'), '{}'::programa[]
    FROM announcements
    WHERE roles_visibles IS NOT NULL
    AND cardinality(roles_visibles) > 0;

    -- Drop the old column
    ALTER TABLE announcements DROP COLUMN roles_visibles;
  END IF;
END $$;

COMMIT;
