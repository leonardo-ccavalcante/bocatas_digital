-- Extend familia_miembros.relacion CHECK to accept Spanish parentesco values.
-- Until now mapParentescoToRelacion lossily collapsed esposo_a/suegro_a/abuelo_a
-- to 'other'. This widens the CHECK so the helper can pass through the original
-- Spanish enum, preserving family-relationship detail end-to-end.
--
-- Strictly additive: existing rows with relacion in (parent/child/sibling/other)
-- remain valid.

ALTER TABLE public.familia_miembros
  DROP CONSTRAINT IF EXISTS familia_miembros_relacion_check;

ALTER TABLE public.familia_miembros
  ADD CONSTRAINT familia_miembros_relacion_check
  CHECK (relacion = ANY (ARRAY[
    -- English vocabulary (legacy / modal write paths)
    'parent'::text,
    'child'::text,
    'sibling'::text,
    'other'::text,
    -- Spanish parentesco vocabulary (intake/registration write paths)
    'esposo_a'::text,
    'hijo_a'::text,
    'madre'::text,
    'padre'::text,
    'suegro_a'::text,
    'hermano_a'::text,
    'abuelo_a'::text,
    'otro'::text
  ]));
