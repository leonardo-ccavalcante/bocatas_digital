-- 20260506000004_fix_audit_log_insert_check.sql
-- Phase 1.3: restrict announcement_audit_log INSERT to admin/superadmin.
--
-- Pre-existing state:
--   announcement_audit_log_authenticated_insert  INSERT  WITH CHECK (true) ← advisor-flagged
--   announcement_audit_log_admin_select          SELECT  role-checked (KEEP)
--   (no UPDATE/DELETE policies — audit log is append-only by design)
--
-- Note: PR #28 ("redact PII from admin audit logs") fixed PII redaction in audit ROW CONTENT.
-- This is a distinct issue — the RLS POLICY allowed any authenticated user to insert audit
-- rows, which would let a compromised non-admin pollute the audit trail.
--
-- Application impact: NONE. Server uses createAdminClient() (service role) which bypasses RLS.

BEGIN;

DROP POLICY IF EXISTS announcement_audit_log_authenticated_insert ON public.announcement_audit_log;

CREATE POLICY announcement_audit_log_admin_insert ON public.announcement_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() = ANY (ARRAY['superadmin', 'admin']));

COMMIT;
