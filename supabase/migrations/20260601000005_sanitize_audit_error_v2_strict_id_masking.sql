-- v2 of sanitize_audit_error: also mask Spanish ID document patterns
-- when they appear naked (not inside quotes or parens).
--
-- v1 (migration 20260601000003) only handled `(...)=(...)` segments,
-- quoted strings, and runs of 6+ digits. A naked NIE like
-- "Y6802248N" got partially masked to "Y******N" — the letter prefix
-- and check letter survived, leaving an identifiable pattern.
-- A naked DNI like "12345678A" was masked to "******A".
--
-- v2 adds two pre-passes that mask the full Spanish ID token:
--   * NIE: [XYZ] + 7-8 digits + [A-Z]   (e.g. Y6802248N → ***)
--   * DNI: 7-8 digits + [A-Z]           (e.g. 12345678A → ***)
--
-- The `\m` and `\M` word-boundary markers prevent false positives on
-- substrings inside larger tokens. Postgres regex flavour, posix-ish.
--
-- Validated against the live database with realistic SQLERRM samples
-- (see server/__tests__/sanitize_audit_error.test.ts). 5-digit postal
-- codes are preserved by design (low-information alone).

CREATE OR REPLACE FUNCTION public.sanitize_audit_error(p_msg text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(COALESCE(p_msg, ''), '\([^)]*\)=\([^)]*\)', '(redacted)', 'g'),
            '"[^"]*"', '"***"', 'g'
          ),
          '\m\d{7,8}[A-Z]\M', '***', 'g'
        ),
        '\m[XYZ]\d{7,8}[A-Z]\M', '***', 'g'
      ),
      '\d{6,}', '******', 'g'
    );
$$;

REVOKE EXECUTE ON FUNCTION public.sanitize_audit_error(text) FROM PUBLIC, anon, authenticated;
