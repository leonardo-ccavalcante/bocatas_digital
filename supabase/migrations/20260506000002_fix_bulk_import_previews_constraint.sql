-- Fix: parsed_rows is a JSONB object {groups: [...], src_filename: ...}, not a bare array.
-- The old constraint called jsonb_array_length() on an object, causing PostgreSQL error 22023
-- "cannot get array length of a non-array" on every INSERT into bulk_import_previews.
-- Replace with a constraint that checks the nested groups array length.
TRUNCATE TABLE public.bulk_import_previews;

ALTER TABLE public.bulk_import_previews
  DROP CONSTRAINT IF EXISTS bulk_import_previews_parsed_rows_max;

ALTER TABLE public.bulk_import_previews
  ADD CONSTRAINT bulk_import_previews_parsed_rows_max
  CHECK (
    jsonb_typeof(parsed_rows) = 'object'
    AND jsonb_array_length(parsed_rows -> 'groups') <= 10000
  );
