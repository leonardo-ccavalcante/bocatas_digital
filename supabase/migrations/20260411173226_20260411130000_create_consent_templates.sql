-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260411173226 — name: 20260411130000_create_consent_templates

CREATE TABLE public.consent_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose        consent_purpose NOT NULL,
  idioma         consent_language NOT NULL,
  version        VARCHAR(10) NOT NULL DEFAULT '1.0',
  text_content   TEXT NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  updated_by     UUID REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX consent_templates_active_unique
  ON consent_templates (purpose, idioma)
  WHERE is_active = true;

ALTER TABLE consent_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_active" ON consent_templates
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "superadmin_select_all" ON consent_templates
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin');

CREATE POLICY "superadmin_write" ON consent_templates
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin');
