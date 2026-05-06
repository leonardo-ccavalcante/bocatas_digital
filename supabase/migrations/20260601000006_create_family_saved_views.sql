-- Saved-view storage for the Familias tab inside /programas/programa_familias.
-- Each row is one saved filter set. is_shared=true makes it visible to all admins.

CREATE TABLE IF NOT EXISTS family_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,                              -- ctx.user.id (Manus IDs are non-UUID)
  programa_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  descripcion text,
  filters_json jsonb NOT NULL,                        -- Zod-validated FamiliasFiltersSpec
  is_shared boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX family_saved_views_user_idx
  ON family_saved_views(user_id, programa_id);
CREATE INDEX family_saved_views_shared_idx
  ON family_saved_views(programa_id) WHERE is_shared;

ALTER TABLE family_saved_views ENABLE ROW LEVEL SECURITY;

-- Admins/superadmins can read their own views + shared views in their tenant.
CREATE POLICY "saved_views_admin_read"
  ON family_saved_views FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() IN ('admin','superadmin') AND
    (user_id = (auth.jwt() ->> 'sub') OR is_shared = true)
  );

-- Admins/superadmins can write only their own rows.
CREATE POLICY "saved_views_admin_write"
  ON family_saved_views FOR ALL
  TO authenticated
  USING (public.get_user_role() IN ('admin','superadmin') AND user_id = (auth.jwt() ->> 'sub'))
  WITH CHECK (public.get_user_role() IN ('admin','superadmin') AND user_id = (auth.jwt() ->> 'sub'));

-- Auto-update updated_at via existing trigger function.
CREATE TRIGGER family_saved_views_updated_at
  BEFORE UPDATE ON family_saved_views
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
