-- ============================================================================
-- 20260505000998_capture_rls_auto_enable_from_prod.sql
--
-- CANONICAL — captures the rls_auto_enable() event-trigger function AND
-- its `ensure_rls` event trigger from production.
--
-- BACKGROUND
--
--   In production, an event trigger fires on `ddl_command_end` for every
--   CREATE TABLE in the `public` schema and automatically enables Row-Level
--   Security on the new table. This is defense-in-depth: a developer who
--   forgets `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` still gets RLS
--   on by default, with the explicit-deny fallback (no policies = no access
--   for non-owner roles).
--
--   The function + trigger exist in prod but were never captured in repo
--   migrations (one of the ~30 gaps documented in
--   supabase/migrations/EXPORTED/README.md). On a fresh CI / local DB,
--   the function doesn't exist, so the REVOKE in
--   20260506000007_phase2_revoke_public_authenticated_from_secdef.sql
--   skips it via the existence-tolerant DO block.
--
--   More importantly: WITHOUT this trigger, subsequent CREATE TABLE
--   migrations don't get RLS auto-enabled in CI/local, so the local DB
--   diverges from prod's security posture. Tests that exercise RLS edge
--   cases pass locally but break in prod.
--
-- SOURCE OF TRUTH
--
--   Function body + trigger definition pulled from the live production
--   cluster on 2026-05-20 via the Supabase Management API SQL endpoint
--   (pg_get_functiondef + pg_event_trigger).
--
-- IDEMPOTENCY
--
--   CREATE OR REPLACE FUNCTION is safe against prod (no-op when body
--   matches) and CI/local (creates fresh). The CREATE EVENT TRIGGER is
--   guarded by a DO block check on pg_event_trigger so re-running against
--   prod doesn't error with duplicate_object.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
    IF cmd.schema_name IS NOT NULL
       AND cmd.schema_name IN ('public')
       AND cmd.schema_name NOT IN ('pg_catalog','information_schema')
       AND cmd.schema_name NOT LIKE 'pg_toast%'
       AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format(
          'alter table if exists %s enable row level security',
          cmd.object_identity
        );
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
    ELSE
      RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)',
        cmd.object_identity, cmd.schema_name;
    END IF;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.rls_auto_enable() IS
  'Event-trigger function: auto-enables RLS on CREATE TABLE in the public '
  'schema. Defense-in-depth — see comments + ensure_rls trigger below. '
  'Captured from prod 2026-05-20.';

-- Create the event trigger only if it doesn't already exist (prod has it).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls') THEN
    CREATE EVENT TRIGGER ensure_rls
      ON ddl_command_end
      EXECUTE FUNCTION public.rls_auto_enable();
    RAISE NOTICE 'created event trigger ensure_rls';
  ELSE
    RAISE NOTICE 'event trigger ensure_rls already exists, leaving as-is';
  END IF;
END $$;
