-- Create delivery_round_assignments: one row per (round, family).
--
-- This is the SCHEDULE — which families are expected on which day, and (after
-- close-out) whether they attended. Kept distinct from `deliveries` (which
-- records a delivery that HAPPENED); conflating them would lose the no-show
-- rows the absentismo metric needs.
--
-- AUTH NOTE: attended_by is TEXT (String(ctx.user.id)), no FK — see delivery_rounds.

CREATE TABLE IF NOT EXISTS public.delivery_round_assignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  round_id       UUID NOT NULL CONSTRAINT dra_round_id_fkey
                   REFERENCES public.delivery_rounds(id) ON DELETE CASCADE,
  family_id      UUID NOT NULL CONSTRAINT dra_family_id_fkey
                   REFERENCES public.families(id) ON DELETE CASCADE,

  assigned_day   DATE NOT NULL,
  day_slot       INTEGER NOT NULL CONSTRAINT dra_day_slot_chk CHECK (day_slot >= 1),
  -- A fixed/agreed day (set on reschedule); the assignment engine anchors here.
  preferred_day  DATE,

  expediente     TEXT,                                   -- familia_numero as text, for the acta
  total_miembros INTEGER NOT NULL DEFAULT 1 CONSTRAINT dra_total_miembros_chk CHECK (total_miembros >= 1),

  -- kg snapshot at generation time (linear per-person split).
  kg_alimentos   NUMERIC(10, 2),
  kg_carne       NUMERIC(10, 2),

  -- Close-out: NULL = pending, TRUE = atendida, FALSE = no_show.
  attended       BOOLEAN,
  attended_at    TIMESTAMP WITH TIME ZONE,
  attended_by    TEXT,

  estado_contacto TEXT NOT NULL DEFAULT 'pendiente'
                   CONSTRAINT dra_estado_contacto_chk
                   CHECK (estado_contacto IN ('pendiente','confirmada','no_contesta','reprogramada')),

  reschedule_log JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{from, to, motivo, at, by}]
  undo_log       JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{prev, at, by}]
  notas          TEXT,

  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT dra_round_family_uq UNIQUE (round_id, family_id)
);

CREATE INDEX IF NOT EXISTS idx_dra_round_day      ON public.delivery_round_assignments(round_id, assigned_day);
CREATE INDEX IF NOT EXISTS idx_dra_round_attended ON public.delivery_round_assignments(round_id, attended);
CREATE INDEX IF NOT EXISTS idx_dra_family         ON public.delivery_round_assignments(family_id);

ALTER TABLE public.delivery_round_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dra_authenticated_all ON public.delivery_round_assignments;
CREATE POLICY dra_authenticated_all ON public.delivery_round_assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_dra_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_dra_updated_at ON public.delivery_round_assignments;
CREATE TRIGGER trg_dra_updated_at
  BEFORE UPDATE ON public.delivery_round_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_dra_updated_at();

-- T1b — atomic "replace this round's assignments" used by commitAssignments.
-- Deletes existing rows and inserts the new batch in one transaction so a
-- mid-commit failure can't leave the round with no assignments.
CREATE OR REPLACE FUNCTION public.commit_round_assignments(p_round_id UUID, p_rows JSONB)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.delivery_round_assignments WHERE round_id = p_round_id;

  INSERT INTO public.delivery_round_assignments
    (round_id, family_id, assigned_day, day_slot, preferred_day,
     expediente, total_miembros, kg_alimentos, kg_carne)
  SELECT
    p_round_id,
    (r->>'family_id')::uuid,
    (r->>'assigned_day')::date,
    (r->>'day_slot')::int,
    NULLIF(r->>'preferred_day','')::date,
    r->>'expediente',
    COALESCE((r->>'total_miembros')::int, 1),
    NULLIF(r->>'kg_alimentos','')::numeric,
    NULLIF(r->>'kg_carne','')::numeric
  FROM jsonb_array_elements(p_rows) AS r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
