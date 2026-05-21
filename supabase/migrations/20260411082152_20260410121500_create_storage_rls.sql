-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260411082152 — name: 20260410121500_create_storage_rls

CREATE POLICY storage_documentos_identidad_admin ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'documentos-identidad' AND public.get_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (bucket_id = 'documentos-identidad' AND public.get_user_role() IN ('superadmin', 'admin'));

CREATE POLICY storage_consentimientos_admin ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'consentimientos' AND public.get_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (bucket_id = 'consentimientos' AND public.get_user_role() IN ('superadmin', 'admin'));

CREATE POLICY storage_consentimientos_voluntario_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'consentimientos' AND public.get_user_role() = 'voluntario');

CREATE POLICY storage_entregas_admin ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'entregas' AND public.get_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (bucket_id = 'entregas' AND public.get_user_role() IN ('superadmin', 'admin'));

CREATE POLICY storage_entregas_voluntario_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'entregas' AND public.get_user_role() = 'voluntario');
