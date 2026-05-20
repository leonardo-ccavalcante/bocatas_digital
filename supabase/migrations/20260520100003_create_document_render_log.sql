-- Migration: 20260520100003_create_document_render_log.sql
--
-- Append-only audit ledger.  One row per rendered document.
-- No UPDATE / DELETE policies -- immutable evidence trail.
CREATE TABLE public.document_render_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  template_slug TEXT NOT NULL,
  template_id   UUID REFERENCES public.document_templates(id) ON DELETE SET NULL,
  -- Manus int id as TEXT.
  actor_id      TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  -- Optional: link to where the rendered file was stored, if persisted.
  storage_path  TEXT,
  rendered_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX document_render_log_family_idx
  ON public.document_render_log(family_id, rendered_at DESC);
CREATE INDEX document_render_log_slug_idx
  ON public.document_render_log(template_slug, rendered_at DESC);

ALTER TABLE public.document_render_log ENABLE ROW LEVEL SECURITY;

-- Admins and superadmins read.
CREATE POLICY render_log_admin_select ON public.document_render_log
  FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin','superadmin'));

-- Service role inserts (via createAdminClient -- RLS bypassed for writes from server).
-- No UPDATE, no DELETE for any role.

NOTIFY pgrst, 'reload schema';
