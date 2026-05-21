-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260413121750 — name: 20260501100900_create_family_member_documents

CREATE TABLE IF NOT EXISTS family_member_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id        UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_index     INTEGER NOT NULL,
  member_person_id UUID REFERENCES persons(id),
  documento_tipo   TEXT NOT NULL,
  documento_url    TEXT,
  fecha_upload     TIMESTAMPTZ,
  verified_by      UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_family_member_docs_family
  ON family_member_documents (family_id) WHERE deleted_at IS NULL;

ALTER TABLE family_member_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'family_member_documents' AND policyname = 'fmd_admin_all'
  ) THEN
    CREATE POLICY fmd_admin_all ON family_member_documents
      FOR ALL TO authenticated
      USING (get_user_role() IN ('admin', 'superadmin'));
  END IF;
END $$;
