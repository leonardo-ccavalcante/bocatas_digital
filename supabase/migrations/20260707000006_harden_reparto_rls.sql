-- =============================================================================
-- 20260707000006_harden_reparto_rls.sql
-- Close P0-4: permissive RLS on the reparto tables was reachable via PostgREST.
-- =============================================================================
-- delivery_rounds, delivery_round_assignments (and delivery_round_slots on any
-- checkout that ran 20260707000001) each carry a
--   FOR ALL TO authenticated USING (true) WITH CHECK (true)
-- policy. Because (a) this project grants blanket table DML to the `authenticated`
-- API role (20260612000002_recover_role_table_grants.sql) and (b) GoTrue self-signup
-- is enabled, ANY self-registered Supabase user could read / tamper / delete reparto
-- data directly through /rest/v1/*, bypassing the tRPC adminProcedure guard entirely.
--
-- Confirmed LIVE in prod on 2026-07-07:
--   * Supabase advisor lint `rls_policy_always_true` flags both tables:
--     "effectively bypasses row-level security for authenticated";
--   * has_table_privilege('authenticated', ...) = SELECT/INSERT/UPDATE/DELETE all true;
--   * GET /auth/v1/settings -> disable_signup: false.
--
-- Why this fix is safe:
--   The application reaches these tables ONLY through the service-role client
--   (createAdminClient — e.g. server/routers/families/rounds-closeout.ts), which
--   BYPASSES RLS and is NOT affected by REVOKEs on anon/authenticated. There is no
--   direct client access (verified: zero `.from('delivery_round*')` under client/src).
--   So we:
--     1) drop the permissive `authenticated` policies -> with RLS still enabled and
--        no policy present, anon AND authenticated are denied by default, exactly
--        like every other protected table (anon was already denied — it had no policy);
--     2) revoke direct DML from the API roles as defense-in-depth, so a future
--        permissive policy or a blanket re-GRANT cannot silently re-open the door.
--
-- Idempotent; safe on a fresh `db reset` and on the drifted prod ACL. Supersedes the
-- policy created in 20260707000001 for delivery_round_slots.
-- NOTE (operational): the immediate stop-gap is to disable GoTrue self-signup in the
-- prod dashboard (real users authenticate via Manus OAuth, not Supabase Auth — only
-- 4 vestigial auth.users exist, last sign-in 2026-04-11). This migration is the
-- durable, defense-in-depth fix that holds even if signup is ever re-enabled.

-- 1) Remove the permissive "always true" policies -----------------------------
DROP POLICY IF EXISTS delivery_rounds_authenticated_all ON public.delivery_rounds;
DROP POLICY IF EXISTS dra_authenticated_all             ON public.delivery_round_assignments;

DO $$
BEGIN
  IF to_regclass('public.delivery_round_slots') IS NOT NULL THEN
    DROP POLICY IF EXISTS drs_authenticated_all ON public.delivery_round_slots;
  END IF;
END $$;

-- 2) Defense-in-depth: revoke API-role DML (service_role/postgres are unaffected)
REVOKE ALL ON public.delivery_rounds            FROM anon, authenticated;
REVOKE ALL ON public.delivery_round_assignments FROM anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.delivery_round_slots') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.delivery_round_slots FROM anon, authenticated';
  END IF;
END $$;
