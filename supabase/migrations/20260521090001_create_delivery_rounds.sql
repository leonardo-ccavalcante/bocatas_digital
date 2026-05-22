-- Create delivery_rounds (a "reparto" cycle for Programa de Familia).
--
-- A reparto spans several delivery days, has a borrador→activa→cerrada lifecycle,
-- and carries the inputs the operator gives once (kg totals, albarán, factura,
-- logos) to generate the Hoja de Firmas. This is intentionally NOT folded into
-- program_sessions (which is single-day, no pre-assignment phase).
--
-- AUTH NOTE: creado_por is TEXT (String(ctx.user.id)), NOT a UUID FK to
-- auth.users. Auth is Manus OAuth, so ctx.user.id is a stringified MySQL int,
-- not a Supabase UUID — a UUID FK would 22P02 on insert.

CREATE TABLE IF NOT EXISTS public.delivery_rounds (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  program_id   UUID NOT NULL CONSTRAINT delivery_rounds_program_id_fkey
                 REFERENCES public.programs(id) ON DELETE CASCADE,

  -- Contractually-named document title, e.g. "Hoja de Firmas Mayo 2026".
  nombre       TEXT NOT NULL,

  -- Reparto window: first delivery day + how many days it spans.
  fecha_inicio DATE NOT NULL,
  dias_reparto INTEGER NOT NULL CONSTRAINT delivery_rounds_dias_chk CHECK (dias_reparto >= 1),

  -- Balancing mode + optional per-day capacity (people or families).
  cap_mode     TEXT NOT NULL DEFAULT 'people'
                 CONSTRAINT delivery_rounds_cap_mode_chk CHECK (cap_mode IN ('people','families')),
  cap_per_day  INTEGER CONSTRAINT delivery_rounds_cap_per_day_chk CHECK (cap_per_day IS NULL OR cap_per_day > 0),

  -- Hoja de Firmas inputs (kg are distributed linearly across people).
  kg_total_alimentos NUMERIC(10, 2),
  kg_total_carne     NUMERIC(10, 2),
  num_albaran_ba     TEXT,
  num_factura_carne  TEXT,
  logos              TEXT[] NOT NULL DEFAULT '{}',

  estado       TEXT NOT NULL DEFAULT 'borrador'
                 CONSTRAINT delivery_rounds_estado_chk CHECK (estado IN ('borrador','activa','cerrada')),

  -- Actor: stringified Manus user id (TEXT, no FK — see AUTH NOTE above).
  creado_por   TEXT NOT NULL,

  notas        TEXT,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_delivery_rounds_program ON public.delivery_rounds(program_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_rounds_estado  ON public.delivery_rounds(estado)     WHERE deleted_at IS NULL;

-- RLS: app uses the service-role client (RLS bypassed app-wide); the real PII /
-- access boundary is the adminProcedure guard. Enable RLS as defense-in-depth.
ALTER TABLE public.delivery_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS delivery_rounds_authenticated_all ON public.delivery_rounds;
CREATE POLICY delivery_rounds_authenticated_all ON public.delivery_rounds
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_delivery_rounds_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_delivery_rounds_updated_at ON public.delivery_rounds;
CREATE TRIGGER trg_delivery_rounds_updated_at
  BEFORE UPDATE ON public.delivery_rounds
  FOR EACH ROW EXECUTE FUNCTION public.set_delivery_rounds_updated_at();
