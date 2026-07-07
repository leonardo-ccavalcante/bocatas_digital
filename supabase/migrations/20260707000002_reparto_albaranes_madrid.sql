-- Reparto: multiple albaranes / facturas (up to 4) + fuera-de-Madrid slot flag.
--
--   1) delivery_rounds.num_albaran_ba / num_factura_carne: TEXT -> TEXT[].
--      Banco de Alimentos issues several delivery notes per reparto and the meat
--      can arrive across several invoices; existing single values become
--      1-element arrays. Guarded on the current column type so a re-apply is a
--      no-op (multi-shape tolerant).
--   2) delivery_round_slots.es_fuera_madrid: the operator can reserve the first
--      slot for beneficiaries from outside Madrid, who are served at their own
--      earlier time. The flag persists so the Hoja de Firmas and reports know
--      which turno is theirs.
--   3) create_round_with_slots: read the arrays (guarded) and the per-slot flag.

-- ── 1) Albaranes / facturas → TEXT[] (only convert while still scalar) ───────
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'delivery_rounds'
        AND column_name = 'num_albaran_ba') = 'text' THEN
    ALTER TABLE public.delivery_rounds
      ALTER COLUMN num_albaran_ba TYPE TEXT[]
        USING (CASE WHEN num_albaran_ba IS NULL OR num_albaran_ba = ''
                    THEN NULL ELSE ARRAY[num_albaran_ba] END);
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'delivery_rounds'
        AND column_name = 'num_factura_carne') = 'text' THEN
    ALTER TABLE public.delivery_rounds
      ALTER COLUMN num_factura_carne TYPE TEXT[]
        USING (CASE WHEN num_factura_carne IS NULL OR num_factura_carne = ''
                    THEN NULL ELSE ARRAY[num_factura_carne] END);
  END IF;
END $$;

-- ── 2) Fuera-de-Madrid flag on the slot ─────────────────────────────────────
ALTER TABLE public.delivery_round_slots
  ADD COLUMN IF NOT EXISTS es_fuera_madrid BOOLEAN NOT NULL DEFAULT false;

-- ── 3) Atomic create round + slots, now with arrays + fuera flag ────────────
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
    CASE WHEN jsonb_typeof(p_round->'num_albaran_ba') = 'array'
         THEN (SELECT array_agg(x) FROM jsonb_array_elements_text(p_round->'num_albaran_ba') AS x WHERE x <> '')
         ELSE NULL END,
    CASE WHEN jsonb_typeof(p_round->'num_factura_carne') = 'array'
         THEN (SELECT array_agg(x) FROM jsonb_array_elements_text(p_round->'num_factura_carne') AS x WHERE x <> '')
         ELSE NULL END,
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_round->'logos') AS x), '{}'),
    'borrador',
    p_round->>'creado_por',
    NULLIF(p_round->>'notas','')
  ) RETURNING id INTO v_round_id;

  INSERT INTO public.delivery_round_slots (round_id, slot_date, turno, cap, es_fuera_madrid)
  SELECT v_round_id, (s->>'slot_date')::date, s->>'turno', NULLIF(s->>'cap','')::int,
         COALESCE((s->>'es_fuera_madrid')::boolean, false)
  FROM jsonb_array_elements(p_slots) AS s;

  RETURN v_round_id;
END;
$$;
