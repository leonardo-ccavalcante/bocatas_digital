# CSV Bulk Import — Database Migration Guide

## Overview

This document provides step-by-step instructions for executing the database migration to enable the CSV bulk import feature for announcements.

## Critical Issue Fixed

**Root Cause:** The `bulk_import_previews` table had a type mismatch:
- Column `created_by` was defined as `uuid`
- Code inserts `String(ctx.user.id)` (text/string value)
- Result: "invalid input syntax for type uuid: '1'" error

**Solution:** Changed `created_by` from `uuid` to `text` and updated RLS policies to cast `auth.uid()::text` for proper comparison.

## Migration Steps

### Step 1: Apply the Migration in Supabase Dashboard

1. Go to **Supabase Dashboard** → Your Project → **SQL Editor**
2. Create a new query and paste the SQL from `/supabase/migrations/20260501000007_bulk_import_previews.sql`
3. Execute the query

**SQL to Execute:**

```sql
-- Temporary storage for bulk import preview data
-- Rows are filtered by created_at > now() - interval '30 minutes' at query time (TTL)
CREATE TABLE IF NOT EXISTS bulk_import_previews (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parsed_rows jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for TTL filtering and cleanup
CREATE INDEX IF NOT EXISTS idx_bulk_import_previews_created_at
  ON bulk_import_previews (created_at);

-- RLS: only the creator (who must be admin/superadmin) can access their preview
ALTER TABLE bulk_import_previews ENABLE ROW LEVEL SECURITY;

-- SELECT: only own rows and only if admin/superadmin
DROP POLICY IF EXISTS bulk_import_previews_own_select ON bulk_import_previews;
CREATE POLICY bulk_import_previews_own_select ON bulk_import_previews
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()::text
    AND public.get_user_role() IN ('superadmin', 'admin')
  );

-- INSERT: admin/superadmin only, must be own row
DROP POLICY IF EXISTS bulk_import_previews_own_insert ON bulk_import_previews;
CREATE POLICY bulk_import_previews_own_insert ON bulk_import_previews
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()::text
    AND public.get_user_role() IN ('superadmin', 'admin')
  );

-- DELETE: admin/superadmin only, own rows (for cleanup after confirm)
DROP POLICY IF EXISTS bulk_import_previews_own_delete ON bulk_import_previews;
CREATE POLICY bulk_import_previews_own_delete ON bulk_import_previews
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()::text
    AND public.get_user_role() IN ('superadmin', 'admin')
  );
```

### Step 2: Verify Table Creation

In the SQL Editor, run:

```sql
SELECT * FROM bulk_import_previews LIMIT 1;
```

Expected result: No error (table exists, may be empty)

### Step 3: Test the Feature

1. Navigate to **Administrar novedades** (Admin Announcements)
2. Click **Importar novedades** (Import Announcements)
3. Download the CSV template
4. Fill in test data and upload
5. Verify the preview step shows valid rows and any errors

## What Changed

| Component | Change | Reason |
|-----------|--------|--------|
| `bulk_import_previews.created_by` | `uuid` → `text` | Code inserts string values, not UUIDs |
| RLS SELECT policy | Added `::text` cast to `auth.uid()` | Type matching for text column |
| RLS INSERT policy | Added `::text` cast to `auth.uid()` | Type matching for text column |
| RLS DELETE policy | Added `::text` cast to `auth.uid()` | Type matching for text column |

## Features Enabled

After migration, the following features are available:

### 1. CSV Bulk Import
- Upload CSV with announcements
- Drag-and-drop support
- Real-time validation

### 2. Preview Step
- View valid rows in table
- See errors for invalid rows
- Row-by-row validation feedback

### 3. Confirmation & Import
- One-click import of all valid rows
- Automatic audit trail (who uploaded, when)
- Error handling and rollback

## Testing Checklist

- [ ] Migration executes without errors
- [ ] Table `bulk_import_previews` exists
- [ ] RLS policies are active
- [ ] CSV upload works (click + drag-drop)
- [ ] Preview shows valid rows
- [ ] Preview shows error rows with messages
- [ ] Confirm button imports all valid rows
- [ ] Audit trail is recorded in database

## Rollback (if needed)

If you need to rollback, run:

```sql
DROP TABLE IF EXISTS bulk_import_previews CASCADE;
```

This will remove the table and all associated policies and indexes.

## Support

If you encounter issues:
1. Check the error message in the Supabase dashboard
2. Verify that the migration SQL was copied exactly
3. Ensure RLS policies have the `::text` casts
4. Check that the `get_user_role()` function exists in your database
