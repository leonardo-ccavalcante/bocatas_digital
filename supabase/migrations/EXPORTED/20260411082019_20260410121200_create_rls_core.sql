-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260411082019 — name: 20260410121200_create_rls_core

-- ==================== PERSONS ====================
ALTER TABLE persons ENABLE ROW LEVEL SECURITY;

CREATE POLICY persons_superadmin_all ON persons
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'superadmin')
  WITH CHECK (public.get_user_role() = 'superadmin');

CREATE POLICY persons_admin_all ON persons
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY persons_voluntario_select ON persons
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'voluntario' AND deleted_at IS NULL);

CREATE POLICY persons_voluntario_insert ON persons
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() = 'voluntario');

CREATE POLICY persons_beneficiario_select ON persons
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() = 'beneficiario'
    AND id = public.get_person_id()
    AND deleted_at IS NULL
  );

-- ==================== ATTENDANCES ====================
ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;

CREATE POLICY attendances_superadmin_all ON attendances
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'superadmin')
  WITH CHECK (public.get_user_role() = 'superadmin');

CREATE POLICY attendances_admin_all ON attendances
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY attendances_voluntario_select ON attendances
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'voluntario' AND deleted_at IS NULL);

CREATE POLICY attendances_voluntario_insert ON attendances
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() = 'voluntario' AND registrado_por = auth.uid());

CREATE POLICY attendances_beneficiario_select ON attendances
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() = 'beneficiario'
    AND person_id = public.get_person_id()
    AND deleted_at IS NULL
  );

-- ==================== PROGRAM ENROLLMENTS ====================
ALTER TABLE program_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY enrollments_superadmin_all ON program_enrollments
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'superadmin')
  WITH CHECK (public.get_user_role() = 'superadmin');

CREATE POLICY enrollments_admin_all ON program_enrollments
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY enrollments_voluntario_select ON program_enrollments
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'voluntario' AND deleted_at IS NULL);

CREATE POLICY enrollments_beneficiario_select ON program_enrollments
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() = 'beneficiario'
    AND person_id = public.get_person_id()
    AND deleted_at IS NULL
  );

-- ==================== LOCATIONS ====================
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY locations_authenticated_select ON locations
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY locations_admin_modify ON locations
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.get_user_role() IN ('superadmin', 'admin'));

-- ==================== CONSENTS ====================
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY consents_superadmin_all ON consents
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'superadmin')
  WITH CHECK (public.get_user_role() = 'superadmin');

CREATE POLICY consents_admin_all ON consents
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY consents_voluntario_select ON consents
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'voluntario' AND deleted_at IS NULL);

CREATE POLICY consents_voluntario_insert ON consents
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() = 'voluntario' AND registrado_por = auth.uid());

CREATE POLICY consents_beneficiario_select ON consents
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() = 'beneficiario'
    AND person_id = public.get_person_id()
    AND deleted_at IS NULL
  );
