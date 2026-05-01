-- Migration: Fix bulk_import_previews and add import history tracking
-- Date: 2026-05-01
-- Purpose: Convert created_by from uuid to text, add history table for audit trail

-- PART 1: Fix bulk_import_previews.created_by column type
-- OAuth identifiers (openId) are base64 strings, not UUIDs

-- Step 1a: Create temporary column with correct type (text)
ALTER TABLE bulk_import_previews
ADD COLUMN created_by_text text;

-- Step 1b: Copy existing data from uuid column to text column
UPDATE bulk_import_previews
SET created_by_text = created_by::text;

-- Step 1c: Drop the old uuid column
ALTER TABLE bulk_import_previews
DROP COLUMN created_by;

-- Step 1d: Rename the new text column to created_by
ALTER TABLE bulk_import_previews
RENAME COLUMN created_by_text TO created_by;

-- Step 1e: Add NOT NULL constraint
ALTER TABLE bulk_import_previews
ALTER COLUMN created_by SET NOT NULL;

-- PART 2: Create bulk_import_history table for audit trail
CREATE TABLE IF NOT EXISTS bulk_import_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  total_rows integer NOT NULL,
  successful_rows integer DEFAULT 0,
  failed_rows integer DEFAULT 0,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- PART 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bulk_import_history_created_by ON bulk_import_history(created_by);
CREATE INDEX IF NOT EXISTS idx_bulk_import_history_created_at ON bulk_import_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_import_history_status ON bulk_import_history(status);

-- Enable RLS (Row Level Security)
ALTER TABLE bulk_import_history ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own import history
CREATE POLICY IF NOT EXISTS bulk_import_history_user_isolation ON bulk_import_history
  FOR SELECT
  USING (created_by = auth.jwt() ->> 'sub' OR auth.jwt() ->> 'role' = 'admin');
