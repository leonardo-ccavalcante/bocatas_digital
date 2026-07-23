-- =============================================================================
-- 20260723000004_reparto_bulk_mark_attendance.sql
-- Atomic bulk close-out (OCR confirm): mark many assignments attended AT a slot in
-- ONE transaction, appending an undo_log entry per row.
-- =============================================================================
-- The router previously looped row-by-row in separate DB calls; a mid-loop guard-
-- trigger rejection (e.g. the slot closed concurrently) left earlier rows marked
-- while the mutation errored — a partial, non-atomic write. This RPC locks the slot,
-- proves it belongs to the round and is open, then updates the whole batch (scoped
-- to the round) with a per-row undo_log append, so it is all-or-nothing.

CREATE OR REPLACE FUNCTION public.bulk_mark_attendance(
  p_round_id UUID, p_slot_id UUID, p_ids UUID[], p_attended BOOLEAN, p_actor TEXT
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_slot_round UUID; v_slot_estado TEXT; v_count INTEGER; v_now TIMESTAMPTZ := now();
BEGIN
  SELECT round_id, estado INTO v_slot_round, v_slot_estado
    FROM public.delivery_round_slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND OR v_slot_round <> p_round_id THEN
    RAISE EXCEPTION 'slot_ajeno' USING ERRCODE = 'raise_exception';
  END IF;
  IF v_slot_estado <> 'abierto' THEN
    RAISE EXCEPTION 'turno_cerrado' USING ERRCODE = 'raise_exception';
  END IF;

  UPDATE public.delivery_round_assignments a
    SET attended = p_attended,
        attended_slot_id = p_slot_id,
        attended_at = v_now,
        attended_by = p_actor,
        undo_log = COALESCE(a.undo_log, '[]'::jsonb)
          || jsonb_build_object('prev', a.attended, 'prev_slot_id', a.attended_slot_id, 'at', v_now, 'by', p_actor)
    WHERE a.round_id = p_round_id AND a.id = ANY(p_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bulk_mark_attendance(uuid, uuid, uuid[], boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.bulk_mark_attendance(uuid, uuid, uuid[], boolean, text)
  TO service_role;
