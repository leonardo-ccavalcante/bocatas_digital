-- Fix bulk_import_previews schema: created_by should be text, not uuid
-- OAuth identifiers (openId) are base64 strings, not UUIDs

-- Step 1: Create temporary column with correct type
ALTER TABLE bulk_import_previews
ADD COLUMN created_by_text text;

-- Step 2: Copy data from old column to new column
UPDATE bulk_import_previews
SET created_by_text = created_by::text;

-- Step 3: Drop old column and rename new column
ALTER TABLE bulk_import_previews
DROP COLUMN created_by;

ALTER TABLE bulk_import_previews
RENAME COLUMN created_by_text TO created_by;

-- Step 4: Add NOT NULL constraint
ALTER TABLE bulk_import_previews
ALTER COLUMN created_by SET NOT NULL;

-- Step 5: Update RLS policies to reference the corrected column
-- (Policies already reference created_by, so they automatically work with the corrected type)

-- Verify the schema
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'bulk_import_previews' ORDER BY ordinal_position;
