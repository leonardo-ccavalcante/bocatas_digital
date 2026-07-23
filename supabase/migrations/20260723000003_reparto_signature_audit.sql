-- =============================================================================
-- 20260723000003_reparto_signature_audit.sql
--
-- APPLIES — platform-readiness decision ADR-0008: the schema ships so the platform
-- is ready for the RGPD lawyer to review a working system. Lawyer signoff is a
-- GO-LIVE gate before this table holds PRODUCTION signature evidence, NOT a
-- migration/build blocker. At runtime the recordRepartoSignature procedure is
-- additionally gated by the REPARTO_FIRMA_ENABLED env var (env-presence gate,
-- like N8N_REPARTO_WEBHOOK_URL / PostHog) — unset ⇒ the endpoint refuses.
--
-- Purpose
--   Append-only ledger binding a reparto pickup (delivery_round_assignments row)
--   to (a) the person who signed on the tablet, (b) the server-clock signature
--   moment, (c) the storage path of the static-bitmap PNG, and (d) the SHA-256
--   hashed client IP. ONE canonical signature per assignment (unique index). The
--   audit row IS the legal evidence; the bitmap is only its rendering.
--
--   storage_path lives ON the audit row (not on the assignment) so there is a
--   SINGLE atomic write — this root-causes the entregas non-atomicity (ARG-09,
--   where deliveries.firma_url is patched BEFORE the audit insert): here the
--   record_reparto_pickup RPC inserts the audit row AND stamps attendance in one
--   transaction, so there is no second table to leave half-written.
--
-- Lawful basis: Art. 6.1(c) — Banco de Alimentos subsidy justification (Ley
-- 38/2003), the SAME basis as the DNI on the Hoja de Firmas. NOT consent.
--
-- GO-LIVE COMPLIANCE CHECKLIST (clear before production signature data is collected;
-- track in the EIPD register — see CARTA_ABOGADO_RGPD.md):
--   1. Lawyer: static on-screen bitmap + server-clock signed_at + signer_person_id
--      binding legally equivalent to a wet signature for Banco de Alimentos.
--   2. Hash policy: client_ip_hash = SHA-256(ip || daily_salt); salt rotation +
--      storage location (app_settings.ip_daily_salt) recorded in the EIPD.
--   3. Retention: 4 years min (IRPF/subsidy prescription), ≤6 for audit trails;
--      no TTL / DELETE policy until counsel confirms.
--   4. Signer identity: who may sign for the family (titular / any member /
--      es_autorizado) — confirm with counsel.
--   5. AEPD: static-only capture (no stroke dynamics) keeps this out of Art. 9; if
--      counsel disagrees, fall back to app-layer AES-GCM (server/_core/pii-crypto).
--
-- ROLLBACK / DOWN
--   DROP FUNCTION IF EXISTS public.record_reparto_pickup(uuid,uuid,uuid,text,text,text);
--   DROP TABLE IF EXISTS public.reparto_signature_audit;
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.reparto_signature_audit (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id    UUID NOT NULL REFERENCES public.delivery_round_assignments(id) ON DELETE CASCADE,
  slot_id          UUID NOT NULL REFERENCES public.delivery_round_slots(id) ON DELETE CASCADE,
  signer_person_id UUID NOT NULL REFERENCES public.persons(id),   -- no cascade: never lose the binding
  storage_path     TEXT NOT NULL,                                 -- evidence pointer (single-write)
  signed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),            -- server clock; never client-supplied
  client_ip_hash   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One canonical signature per assignment; a second INSERT is rejected at the DB level.
CREATE UNIQUE INDEX IF NOT EXISTS reparto_signature_one_per_assignment
  ON public.reparto_signature_audit (assignment_id);
CREATE INDEX IF NOT EXISTS reparto_signature_signer_idx
  ON public.reparto_signature_audit (signer_person_id);

-- RLS locked down like 20260707000006: service-role only, tRPC guards are the
-- boundary. No anon/authenticated policy is created (RLS enabled + no policy =
-- deny by default) and DML is revoked from the API roles as defense-in-depth.
ALTER TABLE public.reparto_signature_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reparto_signature_audit FROM anon, authenticated;

-- Atomic pickup: insert the audit row AND stamp attendance in one transaction.
-- Idempotent for a LATE signature (already attended in THIS slot ⇒ only the audit
-- row is inserted); a pending row is attended+stamped; attendance in another slot
-- or an ausente row conflicts.
-- Drop first: OUT-param renames (id/signed_at → audit_id/audit_signed_at) change
-- the return type, which CREATE OR REPLACE cannot do. IF EXISTS = idempotent.
DROP FUNCTION IF EXISTS public.record_reparto_pickup(uuid, uuid, uuid, text, text, text);

-- OUT params are named audit_id / audit_signed_at (NOT id / signed_at) so they do
-- not shadow the `id` column referenced in the WHERE clauses below.
CREATE FUNCTION public.record_reparto_pickup(
  p_assignment_id UUID, p_slot_id UUID, p_signer_person_id UUID,
  p_storage_path TEXT, p_ip_hash TEXT, p_actor TEXT
) RETURNS TABLE (audit_id uuid, audit_signed_at timestamptz) LANGUAGE plpgsql AS $$
DECLARE
  v_round UUID; v_attended BOOLEAN; v_att_slot UUID;
  v_slot_round UUID; v_slot_estado TEXT; v_now TIMESTAMPTZ := now();
  v_audit_id UUID; v_signed_at TIMESTAMPTZ;
BEGIN
  SELECT round_id, attended, attended_slot_id
    INTO v_round, v_attended, v_att_slot
    FROM public.delivery_round_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'asignacion_no_encontrada' USING ERRCODE = 'no_data_found';
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

REVOKE EXECUTE ON FUNCTION public.record_reparto_pickup(uuid, uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.record_reparto_pickup(uuid, uuid, uuid, text, text, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
