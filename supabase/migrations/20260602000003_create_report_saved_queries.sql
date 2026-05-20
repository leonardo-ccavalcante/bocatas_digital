-- M3 — report_saved_queries: persisted custom queries for the Reports tab.
-- Phase 2, Stage S1.
--
-- Structurally mirrors family_saved_views (20260601000006). Each row is one
-- saved custom query (built via CustomQueryBuilder UI). is_shared=true makes
-- it visible to all admins/superadmins in the same programa.
--
-- The spec_json column holds a Zod-validated SavedQuerySpec from
-- shared/reports/savedQuerySpec.ts (which lands with the server-reports
-- Feature Agent in Stage S3). The Spec is a strict allowlist describing
-- entity/fields/operators/groupBy — NEVER raw SQL.

CREATE TABLE IF NOT EXISTS report_saved_queries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,                                  -- ctx.user.id (matches family_saved_views convention)
  programa_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  spec_json   JSONB NOT NULL,                                 -- Zod-validated SavedQuerySpec
                                                              -- (allowlist-driven; NEVER raw SQL).
  is_shared   BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX report_saved_queries_user_idx
  ON report_saved_queries(user_id, programa_id);

CREATE INDEX report_saved_queries_shared_idx
  ON report_saved_queries(programa_id)
  WHERE is_shared;

ALTER TABLE report_saved_queries ENABLE ROW LEVEL SECURITY;

-- READ: admins/superadmins see their own queries + any shared query in their programa.
CREATE POLICY report_saved_queries_admin_read
  ON report_saved_queries FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'superadmin') AND
    (user_id = (auth.jwt() ->> 'sub') OR is_shared = TRUE)
  );

-- WRITE: admins/superadmins can write only their own rows.
CREATE POLICY report_saved_queries_admin_write
  ON report_saved_queries FOR ALL
  TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'superadmin')
    AND user_id = (auth.jwt() ->> 'sub')
  )
  WITH CHECK (
    public.get_user_role() IN ('admin', 'superadmin')
    AND user_id = (auth.jwt() ->> 'sub')
  );

-- Reuse the existing updated_at trigger function (from Phase 1).
CREATE TRIGGER report_saved_queries_updated_at
  BEFORE UPDATE ON report_saved_queries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE report_saved_queries IS
  'Persisted custom queries for the Reports tab. Each row is one '
  'SavedQuerySpec built via CustomQueryBuilder. RLS: admins/superadmins '
  'see own + shared, write own only. NEVER stores raw SQL — only the '
  'allowlist-driven spec consumed by '
  'server/routers/reports/customQuery/executor.ts.';

COMMENT ON COLUMN report_saved_queries.spec_json IS
  'Zod-validated SavedQuerySpec from shared/reports/savedQuerySpec.ts. '
  'Schema: { entity: enum, fields: string[], filters: {...}, groupBy?: '
  'string, limit?: number ≤ 10000 }. Validated server-side BEFORE write.';
