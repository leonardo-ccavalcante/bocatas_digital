-- 20260506000006_phase2_advisor_fixes.sql
-- Phase 2: clear remaining security advisors.
--
-- Fixes:
--   1. function_search_path_mutable (9 functions): pin search_path to pg_catalog, public
--   2. security_definer_view (persons_safe): switch to SECURITY INVOKER (PG 15+ syntax)
--   3. anon_security_definer_function_executable (7 functions): revoke EXECUTE from anon
--      (RLS policies still work — they execute as postgres owner)
--
-- Out of scope (deferred):
--   - extension_in_public (pg_trgm move): risky — trigram indexes (gin_trgm_ops) on persons
--     and the find_duplicate_persons function depend on pg_trgm being in search_path. Move
--     to its own migration with index/function rebuild.
--   - auth_leaked_password_protection: Supabase Auth dashboard toggle, not SQL-fixable.

BEGIN;

-- ===== 1. function_search_path_mutable =====
-- Pin search_path to prevent path-injection (attacker schema before public).
-- Use 'pg_catalog, public' — this matches Postgres default ordering and preserves
-- access to built-in types + project schema. Not '' (empty) which would require
-- fully-qualified references inside function bodies.

ALTER FUNCTION public.announcements_block_author_change()         SET search_path = pg_catalog, public;
ALTER FUNCTION public.enforce_kg_total()                          SET search_path = pg_catalog, public;
ALTER FUNCTION public.enforce_member_counts()                     SET search_path = pg_catalog, public;
ALTER FUNCTION public.enforce_single_default_program()            SET search_path = pg_catalog, public;
ALTER FUNCTION public.update_announcements_updated_at()           SET search_path = pg_catalog, public;
ALTER FUNCTION public.update_deliveries_updated_at()              SET search_path = pg_catalog, public;
ALTER FUNCTION public.update_updated_at_column()                  SET search_path = pg_catalog, public;

-- These three are SECURITY DEFINER + missing search_path — pin too:
ALTER FUNCTION public.get_user_role()                             SET search_path = pg_catalog, public;
ALTER FUNCTION public.get_person_id()                             SET search_path = pg_catalog, public;
ALTER FUNCTION public.find_duplicate_persons(text, text, double precision) SET search_path = pg_catalog, public;

-- ===== 2. security_definer_view (persons_safe) =====
-- The view bypasses RLS because it inherits SECURITY DEFINER from the postgres owner.
-- Recreate WITH (security_invoker = true) so it executes under the querying user's
-- RLS context. The underlying persons table has full role-based RLS, so:
--   superadmin/admin → full access (covered by persons_admin_all / persons_superadmin_all)
--   voluntario       → SELECT non-deleted (covered by persons_voluntario_select)
--   beneficiario     → SELECT only own row (covered by persons_beneficiario_select)
-- The view continues to exclude 4 high-risk fields (foto_documento_url, situacion_legal,
-- recorrido_migratorio, notas_privadas) at the column-projection level.

DROP VIEW IF EXISTS public.persons_safe;
CREATE VIEW public.persons_safe
  WITH (security_invoker = true)
AS
SELECT
  id, nombre, apellidos, fecha_nacimiento, genero, pais_origen,
  idioma_principal, idiomas,
  telefono, email, direccion, municipio, barrio_zona,
  tipo_documento, numero_documento,
  fecha_llegada_espana,
  tipo_vivienda, estabilidad_habitacional, empadronado,
  nivel_estudios, situacion_laboral, nivel_ingresos,
  persona_referencia, canal_llegada, entidad_derivadora,
  es_retorno, motivo_retorno,
  necesidades_principales, observaciones,
  fase_itinerario, estado_empleo, empresa_empleo, alertas_activas,
  restricciones_alimentarias, foto_perfil_url,
  metadata, created_at, updated_at, deleted_at
FROM public.persons;

-- ===== 3. anon_security_definer_function_executable =====
-- Revoke EXECUTE from anon role for SECURITY DEFINER functions that should NOT be
-- callable without authentication. RLS policies still work because policy
-- evaluation runs in the policy-owner's context (postgres), not the caller's.

REVOKE EXECUTE ON FUNCTION public.get_user_role()                    FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_person_id()                    FROM anon;
REVOKE EXECUTE ON FUNCTION public.find_duplicate_persons(text, text, double precision) FROM anon;
REVOKE EXECUTE ON FUNCTION public.confirm_bulk_announcement_import(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upload_family_document(uuid, integer, uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_programs_with_counts()         FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()                  FROM anon;

COMMIT;
