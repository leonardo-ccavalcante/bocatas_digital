-- Reparto close-out integrity (#113). After a turno is 'cerrado', its pending
-- assignments are recorded as no-show (attended=false) by cerrar_turno. Several
-- paths could still mutate that finalised attendance (markAttendance, undo,
-- bulkMarkAttendance) or move the row out (reschedule/reassign resets attended to
-- NULL), corrupting getAbsentismoByRound. The app runs as service_role AND the
-- tables carry permissive `authenticated` RLS + grants, so neither RLS nor the
-- tRPC layer is a real boundary here — the only bypass-proof guard (it fires for
-- service_role AND direct authenticated PostgREST writes alike) is a trigger.
--
-- Three coordinated changes:
--   1) Reorder cerrar_turno: write the no-shows BEFORE flipping the slot to
--      'cerrado', so the guard (which fires once the slot is closed) does not
--      block cerrar_turno's own write.
--   2) A BEFORE INSERT/UPDATE trigger that rejects, on a 'cerrado' slot: any
--      change to attendance and any move in/out, plus inserting a new row into a
--      closed slot. Locks the slot row(s) it checks to close the TOCTOU race vs a
--      concurrent close. (DELETE is intentionally NOT guarded — a row-level
--      trigger can't tell an orphaning single-row delete from the legitimate
--      cascade when the whole round is deleted; the single-row-delete vector is
--      direct-PostgREST only and belongs to #50's grant lockdown, below.)
--   3) move_assignment_to_open_slot also rejects a 'cerrado' SOURCE slot, giving
--      reschedule/reassign a clean error instead of tripping the raw trigger.
--
-- NOT covered here (belongs to #50 — RLS/grant boundary): revoking `authenticated`
-- DML on delivery_round_assignments/_slots (which would also stop a direct
-- single-row DELETE of a no-show), and guarding slot reopen (estado
-- cerrado→abierto). The trigger blocks the attendance-corruption consequence from
-- every role; the broader direct-table lockdown is #50's scope.

-- ── 1) cerrar_turno — no-shows first, THEN close ────────────────────────────
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
  IF (SELECT estado FROM public.delivery_rounds WHERE id = v_round) <> 'activa' THEN
    RAISE EXCEPTION 'ronda_no_activa' USING ERRCODE = 'raise_exception';
  END IF;
  IF v_estado = 'cerrado' THEN
    RAISE EXCEPTION 'turno_ya_cerrado' USING ERRCODE = 'raise_exception';
  END IF;

  -- Mark no-shows FIRST — the slot is still 'abierto' here, so the guard trigger
  -- allows this write. If this ran after the close, the trigger would reject
  -- cerrar_turno's own no-show write.
  UPDATE public.delivery_round_assignments
    SET attended = false, attended_at = v_now, attended_by = p_actor
    WHERE round_id = v_round AND assigned_day = v_date AND turno = v_turno
      AND attended IS NULL;

  -- …THEN close the slot. Every attendance write after this point is blocked.
  UPDATE public.delivery_round_slots
    SET estado = 'cerrado', cerrado_at = v_now, cerrado_por = p_actor
    WHERE id = p_slot_id;
END;
$$;

-- ── 2) Guard trigger — reject post-close attendance mutation / move / insert ─
-- SECURITY DEFINER so the slot lookup is unaffected by the writer's role/RLS.
-- Locks the slot row(s) it inspects (FOR UPDATE): a concurrent cerrar_turno holds
-- that same lock, so an attendance write either commits fully before the close or
-- is re-evaluated against 'cerrado' after it — no torn interleaving.
CREATE OR REPLACE FUNCTION public.reject_attendance_on_closed_slot()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_src TEXT; v_dst TEXT; v_moved BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT estado INTO v_dst FROM delivery_round_slots
      WHERE round_id = NEW.round_id AND slot_date = NEW.assigned_day AND turno = NEW.turno
      FOR UPDATE;
    IF v_dst = 'cerrado' THEN
      RAISE EXCEPTION 'turno_cerrado: no se puede añadir una asignación a un turno ya cerrado'
        USING ERRCODE = 'raise_exception';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE. Inspect the SOURCE slot (OLD placement).
  SELECT estado INTO v_src FROM delivery_round_slots
    WHERE round_id = OLD.round_id AND slot_date = OLD.assigned_day AND turno = OLD.turno
    FOR UPDATE;
  v_moved := NEW.assigned_day IS DISTINCT FROM OLD.assigned_day
             OR NEW.turno IS DISTINCT FROM OLD.turno;

  IF v_src = 'cerrado' THEN
    IF NEW.attended     IS DISTINCT FROM OLD.attended
       OR NEW.attended_at IS DISTINCT FROM OLD.attended_at
       OR NEW.attended_by IS DISTINCT FROM OLD.attended_by
       OR v_moved THEN
      RAISE EXCEPTION 'turno_cerrado: no se puede modificar la asistencia de un turno ya cerrado'
        USING ERRCODE = 'raise_exception';
    END IF;
  END IF;

  -- Moving INTO another slot: that TARGET must not be closed either.
  IF v_moved THEN
    SELECT estado INTO v_dst FROM delivery_round_slots
      WHERE round_id = NEW.round_id AND slot_date = NEW.assigned_day AND turno = NEW.turno
      FOR UPDATE;
    IF v_dst = 'cerrado' THEN
      RAISE EXCEPTION 'turno_destino_cerrado: no se puede mover a un turno ya cerrado'
        USING ERRCODE = 'raise_exception';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_attendance_on_closed_slot ON public.delivery_round_assignments;
CREATE TRIGGER trg_reject_attendance_on_closed_slot
  BEFORE INSERT OR UPDATE ON public.delivery_round_assignments
  FOR EACH ROW EXECUTE FUNCTION public.reject_attendance_on_closed_slot();

-- ── 3) move RPC — reject a closed SOURCE slot (clean error for reschedule) ───
-- The trigger already blocks a move out of a closed slot, but with a generic
-- message the tRPC layer can't map. Checking the source here yields a specific
-- 'turno_origen_cerrado' the router maps to CONFLICT and reassignPending skips.
CREATE OR REPLACE FUNCTION public.move_assignment_to_open_slot(
  p_assignment_id UUID, p_new_day DATE, p_new_turno TEXT, p_actor TEXT, p_log_entry JSONB
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_round UUID; v_src_day DATE; v_src_turno TEXT; v_src_estado TEXT; v_dst_estado TEXT;
BEGIN
  SELECT round_id, assigned_day, turno INTO v_round, v_src_day, v_src_turno
    FROM public.delivery_round_assignments
    WHERE id = p_assignment_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'asignacion_no_encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Source slot must still be open — a finalised (closed) assignment cannot be
  -- moved out, or its recorded no-show would vanish from absentismo.
  SELECT estado INTO v_src_estado FROM public.delivery_round_slots
    WHERE round_id = v_round AND slot_date = v_src_day AND turno = v_src_turno
    FOR UPDATE;
  IF v_src_estado = 'cerrado' THEN
    RAISE EXCEPTION 'turno_origen_cerrado' USING ERRCODE = 'raise_exception';
  END IF;

  -- Lock the target slot and prove it is open at write time.
  SELECT estado INTO v_dst_estado FROM public.delivery_round_slots
    WHERE round_id = v_round AND slot_date = p_new_day AND turno = p_new_turno
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno_destino_inexistente' USING ERRCODE = 'raise_exception';
  END IF;
  IF v_dst_estado <> 'abierto' THEN
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

REVOKE EXECUTE ON FUNCTION public.move_assignment_to_open_slot(uuid, date, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_assignment_to_open_slot(uuid, date, text, text, jsonb) TO service_role;
