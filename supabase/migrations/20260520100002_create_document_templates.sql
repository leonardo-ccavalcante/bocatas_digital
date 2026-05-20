-- Migration: 20260520100002_create_document_templates.sql
--
-- Versioned template registry.  Each row is ONE version of one template.
-- The active version is determined by is_active=true + MAX(version).
-- An admin can deactivate a version without deleting it (audit trail).
CREATE TABLE public.document_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- slug must match what callers pass to renderDocument().
  -- Known slugs: 'informe_social' | 'nota_entrega' | 'derivacion'
  slug           TEXT NOT NULL,
  -- Human-readable label shown in template-editor UI.
  nombre         TEXT NOT NULL,
  -- version is an INTEGER counter scoped per slug.  Start at 1.
  -- A new row is inserted on each publish; old rows stay for audit.
  version        INTEGER NOT NULL DEFAULT 1,
  -- MIME for the rendered output.  Only DOCX is supported in E1.
  mime           TEXT NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  -- Supabase Storage path to the base .docx file in bucket 'document-templates'.
  -- Format: '{slug}/v{version}/{filename}.docx'
  storage_path   TEXT NOT NULL,
  -- Logos array: Supabase Storage paths in bucket 'document-templates'.
  logos          TEXT[] NOT NULL DEFAULT '{}',
  -- Static content blocks: JSON object of string keys -> string values.
  static_blocks  JSONB NOT NULL DEFAULT '{}',
  -- List of placeholder names ({{key}} syntax) declared in this template.
  placeholders   TEXT[] NOT NULL DEFAULT '{}',
  -- Whether this version is the one renderDocument() should use.
  is_active      BOOLEAN NOT NULL DEFAULT false,
  -- Actor columns (TEXT, not UUID -- Manus int IDs).
  created_by     TEXT NOT NULL,
  updated_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce: at most one active version per slug.
CREATE UNIQUE INDEX document_templates_active_slug_uidx
  ON public.document_templates(slug)
  WHERE is_active = true;

-- Lookup by slug for renderDocument() calls.
CREATE INDEX document_templates_slug_version_idx
  ON public.document_templates(slug, version DESC);

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read templates (needed by UI preview).
CREATE POLICY document_templates_authenticated_select
  ON public.document_templates FOR SELECT
  TO authenticated USING (true);

-- Only superadmin can write/publish templates.
CREATE POLICY document_templates_superadmin_write
  ON public.document_templates FOR ALL
  TO authenticated
  USING   (public.get_user_role() = 'superadmin')
  WITH CHECK (public.get_user_role() = 'superadmin');

CREATE TRIGGER document_templates_updated_at
  BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

NOTIFY pgrst, 'reload schema';
