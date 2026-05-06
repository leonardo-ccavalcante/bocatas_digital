-- Migration: Add apellidos, documento, person_id columns to familia_miembros
-- Date: 2026-05-04 (must run BEFORE 20260505_migrate_miembros_to_table.sql)
-- Author: Claude Code (Leo)
-- Why: 20260505_migrate_miembros_to_table.sql (Manus) inserts these three columns,
--      but the live familia_miembros table only has:
--        id, familia_id, nombre, rol, relacion, estado,
--        fecha_nacimiento, documentacion_id, created_at, updated_at
--      The UI (FamiliaDetalle.tsx, MemberConsentCollector.tsx) reads m.apellidos
--      and m.person_id, so they must exist on the table after migration to
--      preserve current UX (member surnames + per-member RGPD consent linking).
--
-- Rollback:
--   ALTER TABLE public.familia_miembros DROP COLUMN IF EXISTS person_id;
--   ALTER TABLE public.familia_miembros DROP COLUMN IF EXISTS documento;
--   ALTER TABLE public.familia_miembros DROP COLUMN IF EXISTS apellidos;
--   DROP INDEX IF EXISTS idx_familia_miembros_person_id;

ALTER TABLE public.familia_miembros
  ADD COLUMN IF NOT EXISTS apellidos text NULL,
  ADD COLUMN IF NOT EXISTS documento text NULL,
  ADD COLUMN IF NOT EXISTS person_id uuid NULL
    REFERENCES public.persons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_familia_miembros_person_id
  ON public.familia_miembros(person_id);
