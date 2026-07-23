-- ============================================================================
-- 20260708000002_add_colectivos_special_category.sql
--
-- RGPD Art. 9/10 SPECIAL-CATEGORY data (ethnic origin / sexual orientation /
-- criminal-offence). "Otras caracteristicas / colectivo" from the IRPF/FSE
-- funder form. Multi-valued (a person can belong to several) -> typed enum[]
-- array + a free-text "Otros (especificar)" companion.
--
-- Access posture: admin/superadmin read only. Primary enforcement is the
-- app-layer redactor (server/_core/rlsRedaction.ts HIGH_RISK_FIELDS) because
-- the app reads via the service-role client (RLS bypassed). The column grants
-- below are defense-in-depth. `colectivo_otros` is additionally app-layer
-- encrypted at rest (server/_core/pii-crypto.ts). Collection happens only under
-- explicit Art. 9(2)(a) consent; production go-live is gated on the signed EIPD
-- addendum (docs/legal/eipd-addendum-colectivos-DRAFT.md).
--
-- Existence-tolerant / idempotent per repo convention.
-- ============================================================================

-- 1. Enum.
DO $$
BEGIN
  CREATE TYPE colectivo AS ENUM ('gitanos', 'lgtbi', 'sin_hogar', 'reclusos_exreclusos');
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'type colectivo already exists, leaving as-is';
END $$;

-- 2. Columns: multi-valued array + free-text "Otros (especificar)".
ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS colectivos      colectivo[],
  ADD COLUMN IF NOT EXISTS colectivo_otros text;

COMMENT ON COLUMN public.persons.colectivos IS
  'RGPD Art. 9/10 special-category (etnia / orientacion sexual / situacion penal). '
  'Admin/superadmin read only (HIGH_RISK_FIELDS + column grants). Collected under '
  'explicit Art. 9(2)(a) consent; production gated on signed EIPD addendum.';
COMMENT ON COLUMN public.persons.colectivo_otros IS
  'Free-text "Otros (especificar)" companion to persons.colectivos. Same RGPD '
  'posture; app-layer encrypted at rest (server/_core/pii-crypto.ts).';

-- 3. GIN index for && / @> array-membership queries (IRPF report aggregation).
CREATE INDEX IF NOT EXISTS idx_persons_colectivos
  ON public.persons USING gin (colectivos)
  WHERE deleted_at IS NULL;

-- 4. Backfill from legacy persons.metadata->'colectivos' (a JSON string array
--    with tags LGTBI / Gitanos / Sin_Hogar / Reclusos, written by the CSV
--    importer). Only fills rows without a typed value yet -> idempotent.
--    Unrecognized tags are skipped (left out), not guessed.
UPDATE public.persons p
   SET colectivos = sub.arr
  FROM (
    SELECT p2.id, array_agg(DISTINCT m.c ORDER BY m.c) AS arr
      FROM public.persons p2
      -- Guard the set-returning call: jsonb_array_elements_text raises on a
      -- non-array scalar, and the WHERE below filters too late. Coerce anything
      -- that isn't a JSON array to an empty array so it yields zero tags.
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(p2.metadata -> 'colectivos') = 'array'
             THEN p2.metadata -> 'colectivos'
             ELSE '[]'::jsonb END
      ) AS tag
      CROSS JOIN LATERAL (
        SELECT (CASE lower(tag)
          WHEN 'lgtbi'     THEN 'lgtbi'
          WHEN 'gitanos'   THEN 'gitanos'
          WHEN 'sin_hogar' THEN 'sin_hogar'
          WHEN 'reclusos'  THEN 'reclusos_exreclusos'
          ELSE NULL END)::colectivo AS c
      ) m
     WHERE jsonb_typeof(p2.metadata -> 'colectivos') = 'array'
       AND m.c IS NOT NULL
     GROUP BY p2.id
  ) sub
 WHERE p.id = sub.id
   AND (p.colectivos IS NULL OR cardinality(p.colectivos) = 0);

-- 5. Defense-in-depth column grants (mirrors 20260508000001_high_risk_fields_rls):
--    revoke column SELECT from `authenticated`, grant to elevated roles. Per-role
--    BEGIN/EXCEPTION tolerates admin_role/superadmin_role not existing on a fresh
--    CI DB. service_role (used by the app) is unaffected by an `authenticated`
--    REVOKE.
DO $$
DECLARE
  role_name  text;
  role_names text[] := ARRAY['admin_role', 'superadmin_role'];
BEGIN
  BEGIN
    EXECUTE 'REVOKE SELECT (colectivos, colectivo_otros) ON public.persons FROM authenticated';
  EXCEPTION WHEN undefined_column THEN
    RAISE NOTICE 'skip REVOKE colectivos: column(s) not present';
  END;

  FOREACH role_name IN ARRAY role_names LOOP
    BEGIN
      EXECUTE format(
        'GRANT SELECT (colectivos, colectivo_otros) ON public.persons TO %I',
        role_name
      );
    EXCEPTION
      WHEN undefined_object THEN
        RAISE NOTICE 'skip GRANT colectivos to %: role not present in this DB', role_name;
    END;
  END LOOP;
END $$;

-- 6. Reload PostgREST schema cache.
NOTIFY pgrst, 'reload schema';
