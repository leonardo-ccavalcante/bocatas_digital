-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260411082020 — name: 20260410121300_create_rls_base
-- All base tables: superadmin/admin full access. Others no access (expanded in Gate 2+).

ALTER TABLE families ENABLE ROW LEVEL SECURITY;
CREATE POLICY families_admin_all ON families
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.get_user_role() IN ('superadmin', 'admin'));

ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY deliveries_admin_all ON deliveries
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.get_user_role() IN ('superadmin', 'admin'));

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY courses_authenticated_select ON courses
  FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY courses_admin_modify ON courses
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.get_user_role() IN ('superadmin', 'admin'));

ALTER TABLE volunteers ENABLE ROW LEVEL SECURITY;
CREATE POLICY volunteers_admin_all ON volunteers
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.get_user_role() IN ('superadmin', 'admin'));

ALTER TABLE grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY grants_admin_all ON grants
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.get_user_role() IN ('superadmin', 'admin'));

ALTER TABLE acompanamientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY acompanamientos_admin_all ON acompanamientos
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.get_user_role() IN ('superadmin', 'admin'));
