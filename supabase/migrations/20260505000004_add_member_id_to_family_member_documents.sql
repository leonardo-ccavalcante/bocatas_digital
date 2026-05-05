-- Add member_id FK to family_member_documents pointing at familia_miembros.
-- Existing column member_index is a positional pointer into the legacy
-- families.miembros JSON array; member_id is the proper relational anchor
-- and survives JSON deprecation.
--
-- Additive only. Table is currently empty so no backfill required.
-- New writes populate both columns until member_index is fully deprecated.

ALTER TABLE public.family_member_documents
  ADD COLUMN IF NOT EXISTS member_id uuid NULL
    REFERENCES public.familia_miembros(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_family_member_documents_member_id
  ON public.family_member_documents(member_id);
