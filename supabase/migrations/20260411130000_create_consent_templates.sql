-- Migration 19: consent_templates
-- Superadmin-managed RGPD consent text versions. Stored in DB so text can be
-- updated without a code deployment.

CREATE TABLE IF NOT EXISTS public.consent_templates (
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

-- Regular users see only active (current) versions — RGPD data minimization
CREATE POLICY "authenticated_select_active" ON consent_templates
  FOR SELECT TO authenticated USING (is_active = true);

-- Superadmin sees all versions (audit trail)
CREATE POLICY "superadmin_select_all" ON consent_templates
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin');

-- Only superadmin can INSERT/UPDATE
CREATE POLICY "superadmin_write" ON consent_templates
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin');
