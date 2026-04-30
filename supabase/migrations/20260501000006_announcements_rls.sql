-- RLS policies for all announcement-related tables
-- Pattern follows existing Bocatas RLS from 20260410121200_create_rls_core.sql

-- ==================== ANNOUNCEMENTS ====================
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- SELECT: All authenticated users can read (visibility filtered by audiences server-side)
DROP POLICY IF EXISTS announcements_authenticated_select ON announcements;
CREATE POLICY announcements_authenticated_select ON announcements
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: admin/superadmin only
DROP POLICY IF EXISTS announcements_admin_insert ON announcements;
CREATE POLICY announcements_admin_insert ON announcements
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('superadmin', 'admin'));

-- UPDATE: admin/superadmin only
DROP POLICY IF EXISTS announcements_admin_update ON announcements;
CREATE POLICY announcements_admin_update ON announcements
  FOR UPDATE TO authenticated
  USING (public.get_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.get_user_role() IN ('superadmin', 'admin'));

-- DELETE: admin/superadmin only
DROP POLICY IF EXISTS announcements_admin_delete ON announcements;
CREATE POLICY announcements_admin_delete ON announcements
  FOR DELETE TO authenticated
  USING (public.get_user_role() IN ('superadmin', 'admin'));

-- ==================== ANNOUNCEMENT_AUDIENCES ====================
ALTER TABLE announcement_audiences ENABLE ROW LEVEL SECURITY;

-- SELECT: All authenticated users can read (needed for visibility join)
DROP POLICY IF EXISTS announcement_audiences_authenticated_select ON announcement_audiences;
CREATE POLICY announcement_audiences_authenticated_select ON announcement_audiences
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: admin/superadmin only
DROP POLICY IF EXISTS announcement_audiences_admin_insert ON announcement_audiences;
CREATE POLICY announcement_audiences_admin_insert ON announcement_audiences
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('superadmin', 'admin'));

-- UPDATE: admin/superadmin only
DROP POLICY IF EXISTS announcement_audiences_admin_update ON announcement_audiences;
CREATE POLICY announcement_audiences_admin_update ON announcement_audiences
  FOR UPDATE TO authenticated
  USING (public.get_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.get_user_role() IN ('superadmin', 'admin'));

-- DELETE: admin/superadmin only
DROP POLICY IF EXISTS announcement_audiences_admin_delete ON announcement_audiences;
CREATE POLICY announcement_audiences_admin_delete ON announcement_audiences
  FOR DELETE TO authenticated
  USING (public.get_user_role() IN ('superadmin', 'admin'));

-- ==================== ANNOUNCEMENT_AUDIT_LOG ====================
ALTER TABLE announcement_audit_log ENABLE ROW LEVEL SECURITY;

-- SELECT: admin/superadmin only (audit is sensitive)
DROP POLICY IF EXISTS announcement_audit_log_admin_select ON announcement_audit_log;
CREATE POLICY announcement_audit_log_admin_select ON announcement_audit_log
  FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('superadmin', 'admin'));

-- INSERT: authenticated users (server controls writes; tighter would block legitimate audits)
-- INSERT: only admin/superadmin may write audit rows. The tRPC router uses
-- the service-role admin client which bypasses RLS, so this policy applies
-- only to direct PostgREST writes from authenticated users — and we never
-- want a beneficiario to fabricate audit history.
DROP POLICY IF EXISTS announcement_audit_log_authenticated_insert ON announcement_audit_log;
CREATE POLICY announcement_audit_log_admin_insert ON announcement_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('superadmin', 'admin'));

-- No UPDATE/DELETE policies - audit log is append-only

-- ==================== ANNOUNCEMENT_DISMISSALS ====================
ALTER TABLE announcement_dismissals ENABLE ROW LEVEL SECURITY;

-- SELECT: User can see own dismissals; admin/superadmin can see all (for "Visto por" counts)
DROP POLICY IF EXISTS announcement_dismissals_own_select ON announcement_dismissals;
CREATE POLICY announcement_dismissals_own_select ON announcement_dismissals
  FOR SELECT TO authenticated
  USING (
    person_id = auth.uid()
    OR public.get_user_role() IN ('superadmin', 'admin')
  );

-- INSERT: User can dismiss for themselves only
DROP POLICY IF EXISTS announcement_dismissals_own_insert ON announcement_dismissals;
CREATE POLICY announcement_dismissals_own_insert ON announcement_dismissals
  FOR INSERT TO authenticated
  WITH CHECK (person_id = auth.uid());

-- DELETE: User can undo own dismissal
DROP POLICY IF EXISTS announcement_dismissals_own_delete ON announcement_dismissals;
CREATE POLICY announcement_dismissals_own_delete ON announcement_dismissals
  FOR DELETE TO authenticated
  USING (person_id = auth.uid());

-- ==================== ANNOUNCEMENT_WEBHOOK_LOG ====================
ALTER TABLE announcement_webhook_log ENABLE ROW LEVEL SECURITY;

-- SELECT: superadmin only (contains webhook URLs which may be sensitive)
DROP POLICY IF EXISTS announcement_webhook_log_superadmin_select ON announcement_webhook_log;
CREATE POLICY announcement_webhook_log_superadmin_select ON announcement_webhook_log
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'superadmin');

-- No INSERT policy - server uses service-role to insert, bypassing RLS
-- No UPDATE/DELETE policies - webhook log is append-only
