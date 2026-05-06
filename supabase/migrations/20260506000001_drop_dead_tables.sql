-- 20260506000001_drop_dead_tables.sql
-- Phase 0.5 cull: remove 2 backups, 2 legacy, 3 Module 2-9 stubs.
--
-- Verified pre-flight (2026-05-05):
--   - Zero `.from()` calls in server/ client/ shared/
--   - Zero writes ever per pg_stat_user_tables (n_tup_ins=0, n_tup_upd=0, n_tup_del=0)
--   - Zero functional dependencies (volunteer registration uses auth.users.raw_user_meta_data.role)
--
-- grants table KEPT (holds €45k IRPF Alimentos 2026 row, real business data).
-- See docs/migrations/2026-05-05-pre-cull-snapshots/README.md for full context, DDL, and restore guidance.

BEGIN;

-- Backup tables (created by ad-hoc backfill scripts, never tracked in app code)
DROP TABLE IF EXISTS public.families_pre_backfill_20260430 CASCADE;
DROP TABLE IF EXISTS public.families_miembros_backup_20260505 CASCADE;

-- Legacy delivery tables (superseded by public.deliveries)
DROP TABLE IF EXISTS public.entregas_batch CASCADE;
DROP TABLE IF EXISTS public.entregas CASCADE;

-- Module 2-9 schema stubs
-- acompanamientos = Module 5+ (case management), courses = Module 3 (formación), volunteers = Module 6 (volunteer profile)
-- User explicitly opted to remove these (B2 in remediation plan conversation 2026-05-05).
-- If those modules are built later, schema is rebuilt fresh from feature spec.
DROP TABLE IF EXISTS public.acompanamientos CASCADE;
DROP TABLE IF EXISTS public.courses CASCADE;
DROP TABLE IF EXISTS public.volunteers CASCADE;

COMMIT;
