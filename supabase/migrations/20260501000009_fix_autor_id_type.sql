-- Fix: announcements.autor_id and announcement_audit_log.edited_by
-- are uuid type but Manus user IDs are non-UUID strings (e.g. "Vdx6QymMi2aW275wQBxTfU").
-- ALTER to text using USING clause for safe conversion of any existing uuid values.

-- 1. Fix announcements.autor_id
ALTER TABLE public.announcements
  ALTER COLUMN autor_id TYPE text
  USING autor_id::text;

-- 2. Fix announcement_audit_log.edited_by
ALTER TABLE public.announcement_audit_log
  ALTER COLUMN edited_by TYPE text
  USING edited_by::text;
