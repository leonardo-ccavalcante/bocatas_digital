-- Reparto turnos: non-consecutive delivery days + per-day turnos (mañana/tarde).
--
-- The scheduling unit becomes a SLOT = (round, slot_date, turno). This migration:
--   1. adds delivery_round_slots — the explicit slot agenda, with per-slot cap,
--      per-slot close state, and per-slot signed acta;
--   2. adds `turno` to delivery_round_assignments with a composite FK to the slot;
--   3. retires the consecutive-day model columns on delivery_rounds
--      (dias_reparto, cap_per_day, cap_mode, signed_actas);
--   4. teaches commit_round_assignments to carry `turno`;
--   5. adds an atomic create_round_with_slots(round, slots) RPC.
--
-- Safe over existing (test) rows: existing assignments are backfilled to a
-- synthesized 'manana' slot so the composite FK holds. Existing-tolerant
-- (IF NOT EXISTS / guarded constraint adds) so a partial re-apply is a no-op.

-- ── 1) Slot agenda ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_round_slots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id    UUID NOT NULL CONSTRAINT drs_round_id_fkey
                REFERENCES public.delivery_rounds(id) ON DELETE CASCADE,
  slot_date   DATE NOT NULL,
  turno       TEXT NOT NULL CONSTRAINT drs_turno_chk CHECK (turno IN ('manana','tarde')),
  cap         INTEGER CONSTRAINT drs_cap_chk CHECK (cap IS NULL OR cap > 0),
  estado      TEXT NOT NULL DEFAULT 'abierto'
                CONSTRAINT drs_estado_chk CHECK (estado IN ('abierto','cerrado')),
  cerrado_at  TIMESTAMP WITH TIME ZONE,
  cerrado_por TEXT,                                   -- String(ctx.user.id), no FK
  signed_acta JSONB,                                  -- {url, by, at} per turno
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT drs_round_date_turno_uq UNIQUE (round_id, slot_date, turno)
);
CREATE INDEX IF NOT EXISTS idx_drs_round ON public.delivery_round_slots(round_id);

ALTER TABLE public.delivery_round_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS drs_authenticated_all ON public.delivery_round_slots;
CREATE POLICY drs_authenticated_all ON public.delivery_round_slots
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_drs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_drs_updated_at ON public.delivery_round_slots;
CREATE TRIGGER trg_drs_updated_at
  BEFORE UPDATE ON public.delivery_round_slots
  FOR EACH ROW EXECUTE FUNCTION public.set_drs_updated_at();

-- ── 2) turno on assignments (+ backfill + composite FK to the slot) ─────────
ALTER TABLE public.delivery_round_assignments ADD COLUMN IF NOT EXISTS turno TEXT;
UPDATE public.delivery_round_assignments SET turno = 'manana' WHERE turno IS NULL;

-- Synthesize a 'manana' slot for every existing (round, day) so the FK holds.
INSERT INTO public.delivery_round_slots (round_id, slot_date, turno)
SELECT DISTINCT round_id, assigned_day, 'manana'
FROM public.delivery_round_assignments
ON CONFLICT (round_id, slot_date, turno) DO NOTHING;

ALTER TABLE public.delivery_round_assignments ALTER COLUMN turno SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dra_turno_chk') THEN
    ALTER TABLE public.delivery_round_assignments
      ADD CONSTRAINT dra_turno_chk CHECK (turno IN ('manana','tarde'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dra_slot_fk') THEN
    ALTER TABLE public.delivery_round_assignments
      ADD CONSTRAINT dra_slot_fk FOREIGN KEY (round_id, assigned_day, turno)
      REFERENCES public.delivery_round_slots(round_id, slot_date, turno) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dra_round_day_turno
  ON public.delivery_round_assignments(round_id, assigned_day, turno);

-- ── 3) Retire the consecutive-day model on delivery_rounds ──────────────────
-- The slot agenda (delivery_round_slots) now holds the schedule; per-slot cap
-- replaces cap_per_day; per-slot signed_acta replaces the day-keyed JSONB map.
ALTER TABLE public.delivery_rounds DROP COLUMN IF EXISTS dias_reparto;
ALTER TABLE public.delivery_rounds DROP COLUMN IF EXISTS cap_per_day;
ALTER TABLE public.delivery_rounds DROP COLUMN IF EXISTS cap_mode;
ALTER TABLE public.delivery_rounds DROP COLUMN IF EXISTS signed_actas;

-- ── 4) commit_round_assignments now carries turno ───────────────────────────
CREATE OR REPLACE FUNCTION public.commit_round_assignments(p_round_id UUID, p_rows JSONB)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER;
BEGIN
  DELETE FROM public.delivery_round_assignments WHERE round_id = p_round_id;

  INSERT INTO public.delivery_round_assignments
    (round_id, family_id, assigned_day, turno, day_slot, preferred_day,
     expediente, total_miembros, kg_alimentos, kg_carne)
  SELECT
    p_round_id,
    (r->>'family_id')::uuid,
    (r->>'assigned_day')::date,
    r->>'turno',
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

-- ── 5) Atomic create round + slots ──────────────────────────────────────────
-- Inserts the borrador round and its (date, turno) slots in one transaction so
-- a mid-create failure can't leave a slot-less zombie round.
CREATE OR REPLACE FUNCTION public.create_round_with_slots(p_round JSONB, p_slots JSONB)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_round_id UUID;
BEGIN
  INSERT INTO public.delivery_rounds
    (program_id, nombre, fecha_inicio, kg_total_alimentos, kg_total_carne,
     num_albaran_ba, num_factura_carne, logos, estado, creado_por, notas)
  VALUES (
    (p_round->>'program_id')::uuid,
    p_round->>'nombre',
    (p_round->>'fecha_inicio')::date,
    NULLIF(p_round->>'kg_total_alimentos','')::numeric,
    NULLIF(p_round->>'kg_total_carne','')::numeric,
    NULLIF(p_round->>'num_albaran_ba',''),
    NULLIF(p_round->>'num_factura_carne',''),
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_round->'logos') AS x), '{}'),
    'borrador',
    p_round->>'creado_por',
    NULLIF(p_round->>'notas','')
  ) RETURNING id INTO v_round_id;

  INSERT INTO public.delivery_round_slots (round_id, slot_date, turno, cap)
  SELECT v_round_id, (s->>'slot_date')::date, s->>'turno', NULLIF(s->>'cap','')::int
  FROM jsonb_array_elements(p_slots) AS s;

  RETURN v_round_id;
END;
$$;
