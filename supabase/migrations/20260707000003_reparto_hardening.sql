-- Reparto concurrency hardening (Codex gate findings). Three atomic RPCs replace
-- multi-statement, check-then-write flows that race under concurrent admins:
--   1) commit_round_assignments — locks the round, re-checks 'borrador', wipes+
--      reinserts assignments AND activates, all in one transaction. Two admins
--      committing the same borrador now serialize; the loser is rejected instead
--      of silently overwriting the winner.
--   2) cerrar_turno — closes the slot AND marks its pendientes as no-show in one
--      transaction (previously two separate statements; a mid-way failure left a
--      closed slot with no no-show rows).
--   3) move_assignment_to_open_slot — moves an assignment after locking the TARGET
--      slot and proving it is still 'abierto' at write time (anti-TOCTOU vs
--      cerrar_turno; used by reschedule and by reassign-pending).
-- Custom SQLSTATE messages are matched by the tRPC layer to map back to
-- NOT_FOUND / CONFLICT / BAD_REQUEST.

-- ── 1) Atomic commit + activate ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.commit_round_assignments(p_round_id UUID, p_rows JSONB)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_estado TEXT; v_count INTEGER;
BEGIN
  SELECT estado INTO v_estado FROM public.delivery_rounds
    WHERE id = p_round_id AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ronda_no_encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_estado <> 'borrador' THEN
    RAISE EXCEPTION 'ronda_ya_activada' USING ERRCODE = 'raise_exception';
  END IF;

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

  UPDATE public.delivery_rounds SET estado = 'activa' WHERE id = p_round_id;
  RETURN v_count;
END;
$$;

-- ── 2) Atomic close-turno + mark no-shows ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.cerrar_turno(p_slot_id UUID, p_actor TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_round UUID; v_date DATE; v_turno TEXT; v_estado TEXT; v_now TIMESTAMPTZ := now();
BEGIN
  SELECT round_id, slot_date, turno, estado
    INTO v_round, v_date, v_turno, v_estado
    FROM public.delivery_round_slots
    WHERE id = p_slot_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno_no_encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  -- A turno can only be closed once its round is active. This blocks closing a
  -- borrador slot and then committing assignments into it (which would leave
  -- attended=NULL rows in a closed turno and let closeRound pass spuriously).
  IF (SELECT estado FROM public.delivery_rounds WHERE id = v_round) <> 'activa' THEN
    RAISE EXCEPTION 'ronda_no_activa' USING ERRCODE = 'raise_exception';
  END IF;
  IF v_estado = 'cerrado' THEN
    RAISE EXCEPTION 'turno_ya_cerrado' USING ERRCODE = 'raise_exception';
  END IF;

  UPDATE public.delivery_round_slots
    SET estado = 'cerrado', cerrado_at = v_now, cerrado_por = p_actor
    WHERE id = p_slot_id;

  UPDATE public.delivery_round_assignments
    SET attended = false, attended_at = v_now, attended_by = p_actor
    WHERE round_id = v_round AND assigned_day = v_date AND turno = v_turno
      AND attended IS NULL;
END;
$$;

-- ── 3) Atomic move to a still-open slot ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.move_assignment_to_open_slot(
  p_assignment_id UUID, p_new_day DATE, p_new_turno TEXT, p_actor TEXT, p_log_entry JSONB
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_round UUID; v_slot_estado TEXT;
BEGIN
  SELECT round_id INTO v_round FROM public.delivery_round_assignments
    WHERE id = p_assignment_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'asignacion_no_encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Lock the target slot and prove it is open at write time.
  SELECT estado INTO v_slot_estado FROM public.delivery_round_slots
    WHERE round_id = v_round AND slot_date = p_new_day AND turno = p_new_turno
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno_destino_inexistente' USING ERRCODE = 'raise_exception';
  END IF;
  IF v_slot_estado <> 'abierto' THEN
    RAISE EXCEPTION 'turno_destino_cerrado' USING ERRCODE = 'raise_exception';
  END IF;

  UPDATE public.delivery_round_assignments
    SET assigned_day = p_new_day,
        turno = p_new_turno,
        preferred_day = p_new_day,
        estado_contacto = 'reprogramada',
        attended = NULL, attended_at = NULL, attended_by = NULL,
        reschedule_log = COALESCE(reschedule_log, '[]'::jsonb) || p_log_entry
    WHERE id = p_assignment_id;
  RETURN v_round;
END;
$$;

-- ── Lock the reparto-mutation RPCs to service_role ──────────────────────────
-- These run SECURITY INVOKER over tables with permissive `authenticated` RLS, so
-- without this a browser client holding the anon key could call them directly and
-- bypass the tRPC admin checks. The server calls them via the service-role key.
REVOKE EXECUTE ON FUNCTION public.create_round_with_slots(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_round_with_slots(jsonb, jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.commit_round_assignments(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_round_assignments(uuid, jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cerrar_turno(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_turno(uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.move_assignment_to_open_slot(uuid, date, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_assignment_to_open_slot(uuid, date, text, text, jsonb) TO service_role;
