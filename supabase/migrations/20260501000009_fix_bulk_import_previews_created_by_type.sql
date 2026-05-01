-- Fix bulk_import_previews schema: created_by should be text, not uuid
-- OAuth identifiers (openId) are base64 strings, not UUIDs
-- This preserves audit trail and allows tracking who uploaded the data

-- Step 1: Create temporary column with correct type (text)
ALTER TABLE bulk_import_previews
ADD COLUMN created_by_text text;

-- Step 2: Copy existing data from uuid column to text column
-- Cast uuid to text to preserve the data
UPDATE bulk_import_previews
SET created_by_text = created_by::text;

-- Step 3: Drop the old uuid column
ALTER TABLE bulk_import_previews
DROP COLUMN created_by;

-- Step 4: Rename the new text column to created_by
ALTER TABLE bulk_import_previews
RENAME COLUMN created_by_text TO created_by;

-- Step 5: Add NOT NULL constraint
ALTER TABLE bulk_import_previews
ALTER COLUMN created_by SET NOT NULL;

-- Verify the schema is correct
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'bulk_import_previews' 
-- ORDER BY ordinal_position;
