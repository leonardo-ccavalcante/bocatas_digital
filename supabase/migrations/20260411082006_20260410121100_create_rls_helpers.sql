-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260411082006 — name: 20260410121100_create_rls_helpers

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role'),
    'beneficiario'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_person_id()
RETURNS UUID AS $$
  SELECT ((auth.jwt() -> 'app_metadata' ->> 'person_id'))::UUID;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
