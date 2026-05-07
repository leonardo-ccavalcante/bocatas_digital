-- 20260506000003_rewrite_announcements_rls.sql
-- Phase 1.2: replace USING(true) policies on announcements with role-based + audience-match.
--
-- Pre-existing state at e8cca83 + 20260506000002:
--   announcements_admin_all          ALL    USING(true) WITH CHECK(true) ← advisor-flagged
--   announcements_admin_delete       DELETE role-checked (KEEP)
--   announcements_admin_insert       INSERT role-checked (KEEP)
--   announcements_admin_update       UPDATE role-checked (KEEP)
--   announcements_authenticated_select  SELECT USING(true) ← too permissive (defense-in-depth gap)
--   announcements_public_read        SELECT USING(activo AND fecha_fin > now()) (KEEP — anon public)
--
-- Changes:
--   DROP announcements_admin_all     — covered by admin_delete/insert/update (all role-checked)
--   DROP announcements_authenticated_select — replace with audience-match SELECT
--   ADD  announcements_admin_select  — admin/superadmin always SELECT
--   ADD  announcements_audience_select — non-admin SELECT requires role match in audience
--
-- Application impact: NONE. Server uses createAdminClient() (service role) which bypasses RLS.
-- Defense-in-depth: prevents leaked-anon-JWT or future direct-to-Supabase consumer (mobile,
-- PowerSync, BI) from reading announcements not audienced to their role.
--
-- Programa-level audience match (audience.programs[] vs user's program) intentionally deferred
-- to a follow-up migration once a canonical "user's program" claim is plumbed through JWT or
-- a SECURITY INVOKER helper function. Until then, admin override + role match is the DB gate;
-- programa filtering remains in tRPC layer (already in place).

BEGIN;

-- Drop the open all-permissive ALL policy (admin operations covered by *_admin_delete/insert/update)
DROP POLICY IF EXISTS announcements_admin_all ON public.announcements;

-- Drop the open SELECT policy
DROP POLICY IF EXISTS announcements_authenticated_select ON public.announcements;

-- Admin/superadmin always SELECT
CREATE POLICY announcements_admin_select ON public.announcements
  FOR SELECT TO authenticated
  USING (public.get_user_role() = ANY (ARRAY['superadmin', 'admin']));

-- Authenticated SELECT now requires audience.roles to include user's role
CREATE POLICY announcements_audience_select ON public.announcements
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.announcement_audiences a
      WHERE a.announcement_id = announcements.id
        AND public.get_user_role() = ANY (a.roles)
    )
  );

-- Note: announcements_public_read (anon, USING activo AND fecha_fin > now()) is unchanged.
-- Note: announcement_audiences_authenticated_select USING(true) is NOT changed here.
-- Advisor does not flag SELECT-true for read access; the audience rows themselves don't reveal
-- the announcement content; and the ANNOUNCEMENT visibility is now properly gated above.

COMMIT;
