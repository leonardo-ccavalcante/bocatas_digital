-- ============================================================================
-- 20260506210007_create_program_document_types.sql
--
-- DB-driven registry replacing the hardcoded `FamilyDocType` TS enum.
-- Each program owns its own document-type catalog. Templates and guides
-- live in the `program-document-templates` storage bucket and are linked
-- here by their `template_url` / `guide_url` paths.
-- ============================================================================

CREATE TABLE IF NOT EXISTS program_document_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programa_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  slug text NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  scope text NOT NULL CHECK (scope IN ('familia','miembro')),
  template_url text,
  template_version text,
  template_filename text,
  guide_url text,
  guide_version text,
  guide_filename text,
  is_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (programa_id, slug)
);

CREATE INDEX program_document_types_active_idx
  ON program_document_types(programa_id, is_active, display_order);

ALTER TABLE program_document_types ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user can read document types.
CREATE POLICY program_document_types_authenticated_read
  ON program_document_types FOR SELECT
  TO authenticated
  USING (true);

-- Write: superadmin only.
CREATE POLICY program_document_types_superadmin_write
  ON program_document_types FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'superadmin')
  WITH CHECK (public.get_user_role() = 'superadmin');

CREATE TRIGGER program_document_types_updated_at
  BEFORE UPDATE ON program_document_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Backward-compatible seed for programa_familias ──────────────────────
-- Mirrors the 7 hardcoded values from shared/familyDocuments.ts so existing
-- upload flows keep working with the same slugs.

DO $$
DECLARE
  prog_id uuid;
BEGIN
  SELECT id INTO prog_id FROM programs WHERE slug = 'programa_familias' LIMIT 1;
  IF prog_id IS NULL THEN
    RAISE NOTICE 'programa_familias program not found - seed skipped';
    RETURN;
  END IF;

  INSERT INTO program_document_types (programa_id, slug, nombre, scope, is_required, display_order)
  VALUES
    (prog_id, 'padron_municipal',         'Padron municipal',          'familia',   true,  10),
    (prog_id, 'justificante_situacion',   'Justificante de situacion', 'familia',   false, 20),
    (prog_id, 'informe_social',           'Informe social',            'familia',   true,  30),
    (prog_id, 'autorizacion_recogida',    'Autorizacion de recogida',  'familia',   false, 40),
    (prog_id, 'documento_identidad',      'Documento de identidad',    'miembro',   true,  50),
    (prog_id, 'consent_bocatas',          'Consentimiento Bocatas',    'miembro',   true,  60),
    (prog_id, 'consent_banco_alimentos',  'Consentimiento BdA',        'miembro',   true,  70)
  ON CONFLICT (programa_id, slug) DO NOTHING;
END $$;

-- Force PostgREST to reload its schema cache.
NOTIFY pgrst, 'reload schema';
