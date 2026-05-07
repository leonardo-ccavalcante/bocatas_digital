-- 20260506000005_rewrite_deliveries_and_program_sessions_rls.sql
-- Phase 1.4: fix deliveries permissive policies + add admin policy to empty program_sessions.
--
-- Pre-existing state on deliveries:
--   deliveries_delete_authenticated  DELETE  USING(true)               ← advisor-flagged
--   deliveries_insert_authenticated  INSERT  WITH CHECK(true)          ← advisor-flagged
--   deliveries_update_authenticated  UPDATE  USING(true) WITH CHECK(true) ← advisor-flagged
--   deliveries_select_authenticated  SELECT  USING(deleted_at IS NULL) (KEEP — restrictive enough)
--
-- Pre-existing state on program_sessions: RLS enabled, ZERO policies (advisor: rls_enabled_no_policy).
--
-- Application impact: NONE. Server uses createAdminClient() (service role) which bypasses RLS.

BEGIN;

-- DELIVERIES: drop the 3 permissive policies
DROP POLICY IF EXISTS deliveries_delete_authenticated ON public.deliveries;
DROP POLICY IF EXISTS deliveries_insert_authenticated ON public.deliveries;
DROP POLICY IF EXISTS deliveries_update_authenticated ON public.deliveries;

-- Admin/superadmin: full CRUD
-- (DROP guard added so this re-runs cleanly on top of EXPORTED's
--  20260411082020_create_rls_base.sql which also creates this policy.)
DROP POLICY IF EXISTS deliveries_admin_all ON public.deliveries;
CREATE POLICY deliveries_admin_all ON public.deliveries
  FOR ALL TO authenticated
  USING (public.get_user_role() = ANY (ARRAY['superadmin', 'admin']))
  WITH CHECK (public.get_user_role() = ANY (ARRAY['superadmin', 'admin']));

-- Voluntario: INSERT only with registrado_por matching their own auth.uid().
-- NOTE: deliveries.registrado_por is `uuid REFERENCES auth.users(id)` per
-- EXPORTED 20260411081841_create_deliveries.sql. Earlier comment incorrectly
-- claimed it was text — `20260501131457_fix_autor_id_and_edited_by_uuid_to_text`
-- changed `autor_id` and `edited_by` (announcements/audit), NOT registrado_por.
-- Compare uuid to uuid directly (CI's stricter PG rejects `uuid = text`).
CREATE POLICY deliveries_voluntario_insert ON public.deliveries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() = 'voluntario'
    AND registrado_por = auth.uid()
  );

-- Voluntario UPDATE/DELETE intentionally not granted: corrections go through admin to preserve
-- delivery-record integrity (Banco de Alimentos audit trail per CLAUDE.md §3 integration constraints).

-- PROGRAM_SESSIONS: minimal admin policy (table is currently empty; future work will add program-scoped policies)
DROP POLICY IF EXISTS program_sessions_admin_all ON public.program_sessions;
CREATE POLICY program_sessions_admin_all ON public.program_sessions
  FOR ALL TO authenticated
  USING (public.get_user_role() = ANY (ARRAY['superadmin', 'admin']))
  WITH CHECK (public.get_user_role() = ANY (ARRAY['superadmin', 'admin']));

COMMIT;
