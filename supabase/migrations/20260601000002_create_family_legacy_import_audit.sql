-- Audit trail for the legacy FAMILIAS CSV importer.
--
-- One row per family per import attempt — `created`, `skipped_duplicate`,
-- or `failed`. Append-only: writes are restricted to the
-- confirm_legacy_familias_import() RPC running SECURITY DEFINER.

CREATE TABLE IF NOT EXISTS public.family_legacy_import_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      text NOT NULL,
  family_id     uuid REFERENCES public.families(id) ON DELETE SET NULL,
  legacy_numero text NOT NULL,
  operation     text NOT NULL CHECK (operation IN ('created', 'skipped_duplicate', 'failed')),
  row_count     integer NOT NULL,
  src_filename  text,
  notes         text,
  ts            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_family_legacy_audit_legacy_ts
  ON public.family_legacy_import_audit (legacy_numero, ts DESC);

CREATE INDEX IF NOT EXISTS idx_family_legacy_audit_actor_ts
  ON public.family_legacy_import_audit (actor_id, ts DESC);

-- Partial index for "was this family created via legacy import?" lookups
-- without sequential-scanning the audit table after it grows.
CREATE INDEX IF NOT EXISTS idx_family_legacy_audit_family_id
  ON public.family_legacy_import_audit (family_id)
  WHERE family_id IS NOT NULL;

ALTER TABLE public.family_legacy_import_audit ENABLE ROW LEVEL SECURITY;

-- SELECT: admin / superadmin only.
-- Wrap get_user_role() in (SELECT ...) so Postgres caches the result for
-- the entire query rather than re-evaluating per row, matching the project
-- convention from 20260506000003_rewrite_announcements_rls.sql.
DROP POLICY IF EXISTS family_legacy_import_audit_admin_read
  ON public.family_legacy_import_audit;

CREATE POLICY family_legacy_import_audit_admin_read
  ON public.family_legacy_import_audit
  FOR SELECT
  TO authenticated
  USING ((SELECT public.get_user_role()) IN ('superadmin', 'admin'));

-- No INSERT / UPDATE / DELETE policies for `authenticated`.
-- Writes flow exclusively through confirm_legacy_familias_import()
-- which runs SECURITY DEFINER (bypasses RLS) and is itself
-- granted only to authenticated. The audit table is append-only
-- by design.

COMMENT ON TABLE public.family_legacy_import_audit IS
  'Append-only audit of legacy FAMILIAS CSV imports. Written exclusively by confirm_legacy_familias_import() RPC.';
