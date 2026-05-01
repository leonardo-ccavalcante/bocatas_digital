# Migration Guide: Fix UUID Validation Error

## Issue
CSV import fails with error: **"invalid input syntax for type uuid: 'Vdx6QymMi2aW275wQBxTfU'"**

## Root Cause
The `bulk_import_previews.created_by` column is defined as `uuid` type, but the application stores OAuth identifiers (`openId`) which are base64 strings, not UUIDs.

## Solution
Change `created_by` column from `uuid` to `text` type to:
- ✅ Accept OAuth identifiers (openId strings)
- ✅ Preserve audit trail (track who uploaded data)
- ✅ Enable proper user identification

## Manual Migration Steps

### Step 1: Access Supabase Dashboard
1. Go to https://supabase.com/dashboard
2. Select your project: **bocatas-digital**
3. Click **SQL Editor** in the left sidebar

### Step 2: Execute Migration SQL
Copy and paste the following SQL into the SQL Editor:

```sql
-- Fix bulk_import_previews schema: created_by should be text, not uuid
-- OAuth identifiers (openId) are base64 strings, not UUIDs

-- Step 1: Create temporary column with correct type (text)
ALTER TABLE bulk_import_previews
ADD COLUMN created_by_text text;

-- Step 2: Copy existing data from uuid column to text column
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
```

### Step 3: Verify Migration
After executing the SQL, verify the schema change:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'bulk_import_previews' 
ORDER BY ordinal_position;
```

Expected output for `created_by` row:
- `column_name`: `created_by`
- `data_type`: `text`

## Verification

After applying the migration:

1. **Run tests to verify fix:**
   ```bash
   pnpm test announcements-uuid-fix
   ```
   Expected: All 5 tests pass ✅

2. **Test CSV import in UI:**
   - Go to `/admin/novedades`
   - Click "Importar CSV"
   - Upload a CSV file
   - Should complete without "invalid input syntax for type uuid" error

3. **Verify audit trail:**
   - Check database: `SELECT created_by FROM bulk_import_previews LIMIT 1;`
   - Should show the actual openId (e.g., `Vdx6QymMi2aW275wQBxTfU`)

## Rollback (if needed)

If you need to revert this change:

```sql
-- Revert: Change created_by back to uuid
ALTER TABLE bulk_import_previews
ADD COLUMN created_by_uuid uuid;

UPDATE bulk_import_previews
SET created_by_uuid = created_by::uuid;

ALTER TABLE bulk_import_previews
DROP COLUMN created_by;

ALTER TABLE bulk_import_previews
RENAME COLUMN created_by_uuid TO created_by;

ALTER TABLE bulk_import_previews
ALTER COLUMN created_by SET NOT NULL;
```

## Impact Analysis

| Component | Impact | Status |
|-----------|--------|--------|
| CSV Import | ✅ Fixes UUID validation error | Ready |
| Audit Trail | ✅ Preserves openId for tracking | Ready |
| Ownership Check | ✅ Works with text openId | Ready |
| RLS Policies | ✅ No changes needed | Compatible |
| Tests | ✅ 5 new tests verify fix | Passing after migration |

## Timeline

- **Migration Time:** < 1 minute
- **Testing Time:** < 2 minutes
- **Total:** ~3 minutes

## Support

If you encounter issues:
1. Check the Supabase logs for error details
2. Verify the column type changed to `text`
3. Run the verification SQL query
4. Contact support if SQL execution fails
