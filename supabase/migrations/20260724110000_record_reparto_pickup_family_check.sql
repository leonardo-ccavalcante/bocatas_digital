-- =============================================================================
-- 20260724110000_record_reparto_pickup_family_check.sql
--
-- MYT-129A (gh #129) — defense-in-depth: bind the signer to the assignment's
-- family INSIDE record_reparto_pickup.
--
-- Before this migration the RPC validated p_signer_person_id ONLY via the FK to
-- persons(id); it never checked that the signer belongs to the family of the
-- delivery_round_assignments row being signed. The tRPC layer
-- (server/routers/families/rounds-signature.ts) already imposes this IDOR check
-- (signer ∈ familia_miembros of asg.family_id, deleted_at IS NULL) BEFORE calling
-- the RPC. This locks the same belt-and-suspenders guard at the DB level so any
-- future caller that bypasses the app-layer guard (a new procedure, a script, an
-- admin backfill) cannot record a pickup signed by someone from a DIFFERENT
-- family. Belt-and-suspenders requested by the PR #125 reviews.
--
-- IMPORTANT — CREATE OR REPLACE, NOT DROP+CREATE. The argument signature and the
-- RETURNS TABLE type are unchanged, so CREATE OR REPLACE suffices and — critically
-- — PRESERVES the existing EXECUTE grant to service_role (AGENTS.md landmine:
-- DROP+CREATE resets grants and every call then 42501s at runtime). We still
-- re-assert the REVOKE/GRANT at the end as harmless, idempotent defense.
--
-- Body is otherwise byte-for-byte the 20260723000003 definition; the ONLY change
-- is (a) selecting family_id into v_family in the existing FOR UPDATE lookup and
-- (b) the new `firmante_ajeno` guard. Every pre-existing RAISE EXCEPTION is kept
-- verbatim (no behavioural regression).
--
-- Existence tolerance: CREATE OR REPLACE FUNCTION is inherently idempotent (it
-- replaces the prior definition). familia_miembros / delivery_round_assignments /
-- reparto_signature_audit are hard dependencies of this RPC and are guaranteed to
-- exist wherever it does — the same tables its original body already references.
--
-- ROLLBACK / DOWN
--   Re-apply 20260723000003's CREATE FUNCTION body (without the family check).
-- =============================================================================

-- OUT params are named audit_id / audit_signed_at (NOT id / signed_at) so they do
-- not shadow the `id` column referenced in the WHERE clauses below.
CREATE OR REPLACE FUNCTION public.record_reparto_pickup(
  p_assignment_id UUID, p_slot_id UUID, p_signer_person_id UUID,
  p_storage_path TEXT, p_ip_hash TEXT, p_actor TEXT
) RETURNS TABLE (audit_id uuid, audit_signed_at timestamptz) LANGUAGE plpgsql AS $$
DECLARE
  v_round UUID; v_attended BOOLEAN; v_att_slot UUID; v_family UUID;
  v_slot_round UUID; v_slot_estado TEXT; v_now TIMESTAMPTZ := now();
  v_audit_id UUID; v_signed_at TIMESTAMPTZ;
BEGIN
  SELECT round_id, attended, attended_slot_id, family_id
    INTO v_round, v_attended, v_att_slot, v_family
    FROM public.delivery_round_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'asignacion_no_encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Defense-in-depth IDOR guard (MYT-129A): the signer MUST be a non-deleted
  -- member of the assignment's family. Mirrors the tRPC-layer check so a caller
  -- that bypasses the app layer still cannot sign for another family.
  IF NOT EXISTS (
    SELECT 1 FROM public.familia_miembros
      WHERE familia_id = v_family
        AND person_id = p_signer_person_id
        AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'firmante_ajeno' USING ERRCODE = 'raise_exception';
  END IF;

  SELECT round_id, estado INTO v_slot_round, v_slot_estado
    FROM public.delivery_round_slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno_no_encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_slot_round <> v_round THEN
    RAISE EXCEPTION 'slot_ajeno' USING ERRCODE = 'raise_exception';
  END IF;
  IF v_slot_estado <> 'abierto' THEN
    RAISE EXCEPTION 'turno_cerrado' USING ERRCODE = 'raise_exception';
  END IF;

  IF v_attended IS NULL THEN
    -- Pending → record attendance in this slot (the trigger re-checks the slot).
    UPDATE public.delivery_round_assignments
      SET attended = true, attended_at = v_now, attended_by = p_actor,
          attended_slot_id = p_slot_id,
          undo_log = COALESCE(undo_log, '[]'::jsonb)
                     || jsonb_build_object('prev', NULL, 'prev_slot_id', NULL, 'at', v_now, 'by', p_actor)
      WHERE id = p_assignment_id;
  ELSIF v_attended = true AND v_att_slot IS NOT DISTINCT FROM p_slot_id THEN
    -- Late signature for an already-recorded pickup in the same slot: audit only.
    NULL;
  ELSE
    RAISE EXCEPTION 'ya_atendida' USING ERRCODE = 'raise_exception';
  END IF;

  -- Idempotent on retry: a lost-response network retry of a SUCCESSFUL pickup must
  -- not 23505. ON CONFLICT DO NOTHING, then return the existing row when it matches
  -- the same slot + signer; a different signer/slot on an already-signed assignment
  -- is a real conflict.
  INSERT INTO public.reparto_signature_audit
    (assignment_id, slot_id, signer_person_id, storage_path, client_ip_hash)
  VALUES (p_assignment_id, p_slot_id, p_signer_person_id, p_storage_path, p_ip_hash)
  ON CONFLICT (assignment_id) DO NOTHING
  RETURNING reparto_signature_audit.id, reparto_signature_audit.signed_at
    INTO v_audit_id, v_signed_at;

  IF v_audit_id IS NULL THEN
    SELECT reparto_signature_audit.id, reparto_signature_audit.signed_at
      INTO v_audit_id, v_signed_at
      FROM public.reparto_signature_audit
      WHERE assignment_id = p_assignment_id
        AND slot_id = p_slot_id
        AND signer_person_id = p_signer_person_id;
    IF v_audit_id IS NULL THEN
      RAISE EXCEPTION 'firma_conflicto' USING ERRCODE = 'raise_exception';
    END IF;
  END IF;

  RETURN QUERY SELECT v_audit_id, v_signed_at;
END;
$$;

-- CREATE OR REPLACE preserves the prior grant, but re-assert it (idempotent) so
-- the migration is self-contained defense against any earlier grant drift.
REVOKE EXECUTE ON FUNCTION public.record_reparto_pickup(uuid, uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.record_reparto_pickup(uuid, uuid, uuid, text, text, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
