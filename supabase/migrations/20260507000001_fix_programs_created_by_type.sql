-- ============================================================================
-- 20260507000001_fix_programs_created_by_type.sql
--
-- Purpose
--   Fix `programs.created_by` from `uuid REFERENCES auth.users(id)` to `text`,
--   matching the established pattern for Manus-OAuth identity columns.
--
-- Background
--   `server/routers/programs.ts:142` writes `String(ctx.user.id)` (a stringified
--   MySQL int from the Manus OAuth `users` table — `users.id` is `int` per
--   drizzle/schema.ts) into `programs.created_by`. The original schema
--   (`EXPORTED/20260411173300_..._create_programs.sql`) declared the column as:
--
--     created_by UUID REFERENCES auth.users(id)
--
--   Postgres rejects `'42'::uuid` with error code 22P02 ("invalid input syntax
--   for type uuid"), so every admin click on "Crear programa" in the UI
--   (`client/src/pages/Programas.tsx:29`) returned a 500 toast. No row was
--   inserted. Even if the cast succeeded, the FK to auth.users would fail
--   because Manus user IDs do not exist in `auth.users`.
--
-- Established pattern (sister columns already converted uuid→text)
--   - `announcements.autor_id`            (20260501000009_fix_autor_id_type.sql)
--   - `announcement_audit_log.edited_by`  (20260501000009_fix_autor_id_type.sql)
--   - `bulk_import_previews.created_by`   (EXPORTED 20260501123946_fix_bulk_import_created_by_type.sql)
--
--   This migration applies the same conversion to `programs.created_by`, with
--   the additional step of dropping the FK to `auth.users` first (the prior
--   sister-column conversions had no FKs to drop).
--
-- Why no replacement FK
--   Manus user IDs are not Supabase `auth.users` rows. There is no other
--   table to FK to. Application-layer authorization at the tRPC procedure
--   guard (`adminProcedure` / role check) is the audit-trail integrity
--   guarantee — same as `bulk_import_previews.created_by`.
--
-- Rollback
--   ALTER TABLE public.programs ALTER COLUMN created_by TYPE uuid USING NULL;
--   ALTER TABLE public.programs
--     ADD CONSTRAINT programs_created_by_fkey
--     FOREIGN KEY (created_by) REFERENCES auth.users(id);
--   (Note: the rollback drops all existing values to NULL because text→uuid
--    is not safe for arbitrary strings.)
-- ============================================================================

-- Step 1 — Drop the FK to auth.users. The auto-generated constraint name is
-- `programs_created_by_fkey`. Use IF EXISTS for idempotency.
ALTER TABLE public.programs
  DROP CONSTRAINT IF EXISTS programs_created_by_fkey;

-- Step 2 — Convert the column type. USING <col>::text safely converts any
-- existing uuid values. Since the column is NULL by default and admins can't
-- successfully INSERT (22P02), all current rows have created_by = NULL.
ALTER TABLE public.programs
  ALTER COLUMN created_by TYPE text
  USING created_by::text;

-- Step 3 — Force PostgREST to reload its schema cache so the new column type
-- takes effect for the REST API immediately.
NOTIFY pgrst, 'reload schema';
