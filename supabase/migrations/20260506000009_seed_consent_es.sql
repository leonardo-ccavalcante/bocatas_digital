-- 20260506000009_seed_consent_es.sql — Phase 6 QA-1D / F-004 [CRITICAL]
--
-- CLAUDE.md §3 mandate: "Consent is multi-language from day 1.
-- Required languages: Spanish, Arabic, French, Bambara — covers 90%+
-- of Bocatas beneficiary population."
--
-- The existing seed migration 20260413121730 only inserted ar/fr/bm
-- for the `tratamiento_datos_banco_alimentos` purpose. Spanish ('es')
-- was missing — beneficiaries cannot consent in their primary language.
-- This is a Gate-1 launch-blocking RGPD compliance issue.
--
-- This migration adds the Spanish seed for that purpose. Other purposes
-- (`tratamiento_datos_bocatas`, `compartir_datos_red`, `comunicaciones_whatsapp`,
-- `fotografia`) are NOT seeded here — Phase 6 deliberately scopes to
-- the audit finding (F-004). A follow-up Schema-Agent task will seed
-- the remaining purposes once the legal text is approved by counsel.
--
-- Idempotent: ON CONFLICT (purpose, idioma) WHERE is_active DO NOTHING
-- matches the unique index on consent_templates.

INSERT INTO consent_templates (purpose, idioma, version, text_content, is_active) VALUES
  ('tratamiento_datos_banco_alimentos', 'es',
   '1.0',
   'Autorizo el tratamiento de mis datos personales por el Banco de Alimentos para la gestión de las ayudas alimentarias, conforme al Reglamento Europeo RGPD (UE) 2016/679. Puedo retirar mi consentimiento en cualquier momento, contactando con Asociación Bocatas.',
   true)
ON CONFLICT (purpose, idioma) WHERE is_active DO NOTHING;
