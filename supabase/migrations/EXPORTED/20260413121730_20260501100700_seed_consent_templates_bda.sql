-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260413121730 — name: 20260501100700_seed_consent_templates_bda

INSERT INTO consent_templates (purpose, idioma, version, text_content, is_active) VALUES
  ('tratamiento_datos_banco_alimentos', 'ar',
   '1.0',
   'أوافق على معالجة بياناتي الشخصية من قبل بنك الطعام لإدارة المساعدات الغذائية، وفقاً للائحة الأوروبية RGPD (EU) 2016/679.',
   true),
  ('tratamiento_datos_banco_alimentos', 'fr',
   '1.0',
   'Jautorise le traitement de mes données personnelles par la Banque Alimentaire pour la gestion des aides alimentaires, conformément au RGPD (UE) 2016/679.',
   true),
  ('tratamiento_datos_banco_alimentos', 'bm',
   '1.0',
   'N bɛ sɔn ka n ka kunnafoni ɲɛfɔ Banque Alimentaire ma dɔnnikɛ kɛ ni a ye, RGPD (UE) 2016/679 fɔlɔ la.',
   true)
ON CONFLICT (purpose, idioma) WHERE is_active DO NOTHING;
