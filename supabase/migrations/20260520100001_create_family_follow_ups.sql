-- Migration: 20260520100001_create_family_follow_ups.sql
CREATE TABLE public.family_follow_ups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  -- Effective date of this follow-up / review meeting.
  -- This is the date the social worker met the family; it drives the
  -- informe social's effective date for the freshness gate.
  fecha       DATE NOT NULL,
  notas       TEXT,
  -- Actor: Manus MySQL int stored as TEXT (never a Supabase UUID FK).
  created_by  TEXT NOT NULL,
  updated_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX idx_family_follow_ups_family_id
  ON public.family_follow_ups(family_id, fecha DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.family_follow_ups ENABLE ROW LEVEL SECURITY;

-- Admins and superadmins can do everything.
CREATE POLICY follow_ups_admin_all ON public.family_follow_ups
  FOR ALL TO authenticated
  USING   (public.get_user_role() IN ('admin','superadmin'))
  WITH CHECK (public.get_user_role() IN ('admin','superadmin'));

-- Voluntarios: read-only.
CREATE POLICY follow_ups_voluntario_select ON public.family_follow_ups
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'voluntario' AND deleted_at IS NULL);

CREATE TRIGGER family_follow_ups_updated_at
  BEFORE UPDATE ON public.family_follow_ups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

NOTIFY pgrst, 'reload schema';
