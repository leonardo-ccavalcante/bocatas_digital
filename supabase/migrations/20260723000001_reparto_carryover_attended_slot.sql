-- =============================================================================
-- 20260723000001_reparto_carryover_attended_slot.sql
-- Reparto redesign — flexible suggested day + automatic carry-over of no-shows.
-- =============================================================================
-- The old model bound a family to one (assigned_day, turno) slot and cerrar_turno
-- marked that slot's pendientes as no-show on close. The new product model:
--   * the assigned slot is only a SUGGESTION (non-binding) — a family may attend
--     ANY open day of the round;
--   * closing a day/turno only LOCKS that day's records; pending families roll
--     forward automatically (they are simply still `attended IS NULL`);
--   * only close_round (last day) marks never-attended families as ausente.
--
-- Where the family ACTUALLY attended is recorded in a new column, attended_slot_id
-- (distinct from the suggested assigned_day/turno). Attendance immutability is now
-- anchored to that actual slot (or, for pre-migration finalised rows, to the
-- suggested slot — the "legacy branch") and to the round being 'cerrada'.
--
-- Existence-tolerant / idempotent: safe on a fresh `db reset` and on drifted envs.
-- Additive: the 1858 prod assignment rows are all `attended IS NULL` (no finalised
-- data to migrate); attended_slot_id is nullable with no backfill.

-- ── 1) Actual-attendance slot + contact day preferences ─────────────────────
ALTER TABLE public.delivery_round_assignments
  ADD COLUMN IF NOT EXISTS attended_slot_id UUID
    CONSTRAINT dra_attended_slot_fkey REFERENCES public.delivery_round_slots(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_dra_attended_slot
  ON public.delivery_round_assignments(attended_slot_id);

-- Up to 2 days the family declared (during contact) it can attend — non-binding,
-- for admin display/routing only. Validated ≤2 at the Zod/procedure layer.
ALTER TABLE public.delivery_round_assignments
  ADD COLUMN IF NOT EXISTS preferred_slot_ids UUID[] NOT NULL DEFAULT '{}';

-- Extend the contact-state CHECK with 'renuncia' (family declined the whole round).
-- 'no_contesta' already covers "no responde" — reused, not renamed (no churn).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dra_estado_contacto_chk') THEN
    ALTER TABLE public.delivery_round_assignments DROP CONSTRAINT dra_estado_contacto_chk;
  END IF;
  ALTER TABLE public.delivery_round_assignments
    ADD CONSTRAINT dra_estado_contacto_chk
    CHECK (estado_contacto IN ('pendiente','confirmada','no_contesta','reprogramada','renuncia'));
END $$;

-- ── 2) cerrar_turno v3 — close the slot ONLY (no more no-show marking) ───────
-- Carry-over is structural: pending families stay `attended IS NULL` and simply
-- reappear in the next open day's roster. No row is mutated on close.
CREATE OR REPLACE FUNCTION public.cerrar_turno(p_slot_id UUID, p_actor TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_round UUID; v_estado TEXT; v_now TIMESTAMPTZ := now();
BEGIN
  SELECT round_id, estado INTO v_round, v_estado
    FROM public.delivery_round_slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno_no_encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  IF (SELECT estado FROM public.delivery_rounds WHERE id = v_round) <> 'activa' THEN
    RAISE EXCEPTION 'ronda_no_activa' USING ERRCODE = 'raise_exception';
  END IF;
  IF v_estado = 'cerrado' THEN
    RAISE EXCEPTION 'turno_ya_cerrado' USING ERRCODE = 'raise_exception';
  END IF;

  UPDATE public.delivery_round_slots
    SET estado = 'cerrado', cerrado_at = v_now, cerrado_por = p_actor
    WHERE id = p_slot_id;
END;
$$;

-- ── 3) Guard trigger v2 — anchored to the ACTUAL attendance slot ─────────────
-- Rejects, bypass-proof (fires for service_role AND direct authenticated writes):
--   (a) any attendance change once the row's finalising slot is 'cerrado';
--   (b) recording attendance INTO a closed (or foreign) slot;
--   (c) any attendance change once the ROUND is 'cerrada' (close_round writes the
--       ausentes BEFORE flipping estado, so its own write still sees 'activa').
-- Changing the SUGGESTED slot (assigned_day/turno) of a PENDING row is allowed —
-- that is carry-over reschedule, not an attendance mutation.
--
-- Finalising slot of a row:
--   attended_slot_id when set (new model) ELSE the suggested slot when
--   attended IS NOT NULL (legacy branch: protects pre-migration finalised rows).
CREATE OR REPLACE FUNCTION public.reject_attendance_on_closed_slot()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_estado TEXT; v_slot_round UUID; v_changed BOOLEAN; v_round_estado TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only recording attendance into a slot is constrained; pending inserts are free.
    IF NEW.attended_slot_id IS NOT NULL THEN
      SELECT estado, round_id INTO v_estado, v_slot_round
        FROM delivery_round_slots WHERE id = NEW.attended_slot_id FOR UPDATE;
      IF v_slot_round IS DISTINCT FROM NEW.round_id THEN
        RAISE EXCEPTION 'slot_ajeno: el turno no pertenece a esta ronda' USING ERRCODE = 'raise_exception';
      END IF;
      IF v_estado = 'cerrado' THEN
        RAISE EXCEPTION 'turno_cerrado: no se puede registrar asistencia en un turno cerrado' USING ERRCODE = 'raise_exception';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  v_changed := NEW.attended        IS DISTINCT FROM OLD.attended
            OR NEW.attended_slot_id IS DISTINCT FROM OLD.attended_slot_id
            OR NEW.attended_at      IS DISTINCT FROM OLD.attended_at
            OR NEW.attended_by      IS DISTINCT FROM OLD.attended_by;

  IF NOT v_changed THEN
    RETURN NEW; -- suggestion/preference/contact edits on a pending row: always allowed
  END IF;

  -- (c) Round-level immutability once closed.
  SELECT estado INTO v_round_estado FROM delivery_rounds WHERE id = NEW.round_id;
  IF v_round_estado = 'cerrada' THEN
    RAISE EXCEPTION 'ronda_cerrada: no se puede modificar la asistencia de un reparto cerrado' USING ERRCODE = 'raise_exception';
  END IF;

  -- (a) The OLD finalising slot must not be closed.
  IF OLD.attended_slot_id IS NOT NULL THEN
    SELECT estado INTO v_estado FROM delivery_round_slots WHERE id = OLD.attended_slot_id FOR UPDATE;
    IF v_estado = 'cerrado' THEN
      RAISE EXCEPTION 'turno_cerrado: la asistencia de un turno cerrado es inmutable' USING ERRCODE = 'raise_exception';
    END IF;
  ELSIF OLD.attended IS NOT NULL THEN
    -- Legacy row finalised under the old model: its slot is the suggested one.
    SELECT estado INTO v_estado FROM delivery_round_slots
      WHERE round_id = OLD.round_id AND slot_date = OLD.assigned_day AND turno = OLD.turno FOR UPDATE;
    IF v_estado = 'cerrado' THEN
      RAISE EXCEPTION 'turno_cerrado: la asistencia de un turno cerrado es inmutable' USING ERRCODE = 'raise_exception';
    END IF;
  END IF;

  -- (b) The NEW target slot (when set/changed) must belong to the round and be open.
  IF NEW.attended_slot_id IS NOT NULL AND NEW.attended_slot_id IS DISTINCT FROM OLD.attended_slot_id THEN
    SELECT estado, round_id INTO v_estado, v_slot_round
      FROM delivery_round_slots WHERE id = NEW.attended_slot_id FOR UPDATE;
    IF v_slot_round IS DISTINCT FROM NEW.round_id THEN
      RAISE EXCEPTION 'slot_ajeno: el turno no pertenece a esta ronda' USING ERRCODE = 'raise_exception';
    END IF;
    IF v_estado = 'cerrado' THEN
      RAISE EXCEPTION 'turno_cerrado: no se puede registrar asistencia en un turno cerrado' USING ERRCODE = 'raise_exception';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_attendance_on_closed_slot ON public.delivery_round_assignments;
CREATE TRIGGER trg_reject_attendance_on_closed_slot
  BEFORE INSERT OR UPDATE ON public.delivery_round_assignments
  FOR EACH ROW EXECUTE FUNCTION public.reject_attendance_on_closed_slot();

-- ── 4) move_assignment_to_open_slot v3 — pending-only suggestion move ────────
-- Updates the SUGGESTED slot of a still-pending assignment (carry-over reschedule).
-- No longer resets attendance (the row is pending by precondition) and no longer
-- rejects a closed SOURCE slot (moving a pending suggestion out of a day that
-- happened to close is exactly what carry-over needs). Target must exist and be open.
CREATE OR REPLACE FUNCTION public.move_assignment_to_open_slot(
  p_assignment_id UUID, p_new_day DATE, p_new_turno TEXT, p_actor TEXT, p_log_entry JSONB
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_round UUID; v_attended BOOLEAN; v_dst_estado TEXT;
BEGIN
  SELECT round_id, attended INTO v_round, v_attended
    FROM public.delivery_round_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'asignacion_no_encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_attended IS NOT NULL THEN
    RAISE EXCEPTION 'asignacion_finalizada' USING ERRCODE = 'raise_exception';
  END IF;

  SELECT estado INTO v_dst_estado FROM public.delivery_round_slots
    WHERE round_id = v_round AND slot_date = p_new_day AND turno = p_new_turno FOR UPDATE;
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
        reschedule_log = COALESCE(reschedule_log, '[]'::jsonb) || p_log_entry
    WHERE id = p_assignment_id;
  RETURN v_round;
END;
$$;

-- ── 5) close_round — mark never-attended as ausente, THEN close the round ────
-- Ausente = attended=false with attended_slot_id NULL (never came at all), as
-- opposed to an explicit per-day no-show (attended=false + a slot). Writes the
-- ausentes while the round is still 'activa' so the guard trigger allows them,
-- then flips estado. Returns the number of families marked ausente.
CREATE OR REPLACE FUNCTION public.close_round(p_round_id UUID, p_actor TEXT, p_notas TEXT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_estado TEXT; v_open INTEGER; v_count INTEGER; v_now TIMESTAMPTZ := now();
BEGIN
  SELECT estado INTO v_estado FROM public.delivery_rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ronda_no_encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_estado <> 'activa' THEN
    RAISE EXCEPTION 'ronda_no_activa' USING ERRCODE = 'raise_exception';
  END IF;

  SELECT count(*) INTO v_open FROM public.delivery_round_slots
    WHERE round_id = p_round_id AND estado = 'abierto';
  IF v_open > 0 THEN
    RAISE EXCEPTION 'turnos_abiertos:%', v_open USING ERRCODE = 'raise_exception';
  END IF;

  UPDATE public.delivery_round_assignments
    SET attended = false, attended_at = v_now, attended_by = p_actor
    WHERE round_id = p_round_id AND attended IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- NULLIF: an empty-string p_notas (the client passes '' when the operator adds no
  -- note) is treated as "no change", so closing never wipes an existing nota.
  UPDATE public.delivery_rounds
    SET estado = 'cerrada', notas = COALESCE(NULLIF(p_notas, ''), notas)
    WHERE id = p_round_id;
  RETURN v_count;
END;
$$;

-- ── 6) ACLs — service_role only (tRPC guards are the boundary; #50 posture) ──
REVOKE EXECUTE ON FUNCTION public.cerrar_turno(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cerrar_turno(uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.move_assignment_to_open_slot(uuid, date, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.move_assignment_to_open_slot(uuid, date, text, text, jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.close_round(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.close_round(uuid, text, text) TO service_role;
