-- Migration: Enable RLS on family_member_documents table
--
-- Documents may contain PII URLs (DNI scans, signed consents, informe social) —
-- restrict to admin/superadmin only. Voluntario access TBD in Phase 4.
--
-- Pattern mirrors: families_admin_all, deliveries_admin_all in 20260410121300_create_rls_base.sql

ALTER TABLE family_member_documents ENABLE ROW LEVEL SECURITY;

-- Idempotent: drop any pre-existing policies before re-creating
DROP POLICY IF EXISTS family_member_documents_admin_all ON family_member_documents;

-- Single combined policy: admin OR superadmin can do everything (SELECT/INSERT/UPDATE/DELETE)
CREATE POLICY family_member_documents_admin_all
  ON family_member_documents
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.get_user_role() IN ('superadmin', 'admin'));
