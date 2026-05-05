-- 20260506000002_familia_miembros_rls.sql
-- Phase 1.1: add 5 RLS policies to familia_miembros.
--
-- Pre-condition: table has RLS enabled but ZERO policies (advisor: rls_enabled_no_policy).
-- Tracks family member PII (nombre, apellidos, documento, fecha_nacimiento, person_id link).
-- Same access pattern as public.families (mirror existing policy shape):
--   superadmin: full access
--   admin:      full access
--   voluntario: SELECT/INSERT only on members whose parent family is active and visible
--   beneficiario: SELECT only own row (person_id = get_person_id())

BEGIN;

-- superadmin: full access
CREATE POLICY familia_miembros_superadmin_all ON public.familia_miembros
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'superadmin')
  WITH CHECK (public.get_user_role() = 'superadmin');

-- admin: full access
CREATE POLICY familia_miembros_admin_all ON public.familia_miembros
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

-- voluntario: SELECT only members of ACTIVE non-deleted families, where the row itself isn't soft-deleted
CREATE POLICY familia_miembros_voluntario_select ON public.familia_miembros
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() = 'voluntario'
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = familia_miembros.familia_id
        AND f.estado = 'activa'
        AND f.deleted_at IS NULL
    )
  );

-- voluntario: INSERT only into active visible family
CREATE POLICY familia_miembros_voluntario_insert ON public.familia_miembros
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() = 'voluntario'
    AND EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = familia_miembros.familia_id
        AND f.estado = 'activa'
        AND f.deleted_at IS NULL
    )
  );

-- beneficiario: SELECT only own row (member.person_id = get_person_id())
CREATE POLICY familia_miembros_beneficiario_select ON public.familia_miembros
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() = 'beneficiario'
    AND person_id = public.get_person_id()
    AND deleted_at IS NULL
  );

COMMIT;
