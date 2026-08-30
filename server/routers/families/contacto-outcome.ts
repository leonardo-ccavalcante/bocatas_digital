// MYTHOS: MYT-129B (gh #129)
//
// Shared "apply a contacto outcome" write, used by BOTH the admin mutation
// (rounds-contacto.ts's setContactoFamilia) and the n8n inbound webhook
// (reparto-contacto-inbound.ts). Before this file existed the two call sites
// hand-rolled the same write independently and already diverged once — the
// renuncia-clears-preferred bug fixed in #125. Pinning the derivation here
// means a future edit to one call site can no longer silently re-diverge from
// the other.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../client/src/lib/database.types";
import type { EstadoContacto } from "../../../shared/repartoSchemas";

type AssignmentsUpdate = Database["public"]["Tables"]["delivery_round_assignments"]["Update"];

export interface ContactoOutcomeInput {
  assignmentId: string;
  estado: EstadoContacto;
  preferredSlotIds: string[];
  actor: string;
  /**
   * The assignment's estado_contacto as stored BEFORE this write (the caller
   * reads it in the same request). Required so a non-renuncia outcome recorded
   * over a stored 'renuncia' clears the ausente stamp — the reversal the
   * contact dialog promises (F185, gh #129) — while a re-contact over any
   * other estado never touches the attended fields.
   */
  previousEstado: string | null;
}

/**
 * The single source of truth for what a contacto outcome writes: a renuncia is
 * derived from `estado` (never a separate flag) and ALWAYS clears
 * preferred_slot_ids + stamps the assignment ausente — even if the caller
 * still holds stale preferred ids. Conversely, a non-renuncia outcome over a
 * stored 'renuncia' resets attended/attended_slot_id/attended_at/attended_by
 * to NULL so the family is pending again on every open day's roster.
 * Exported standalone so a call site that must merge extra columns into the
 * same single UPDATE (e.g. the n8n inbound handler's reschedule_log) can
 * still share this exact derivation.
 */
export function buildContactoOutcomeUpdate({
  estado,
  preferredSlotIds,
  actor,
  previousEstado,
}: Omit<ContactoOutcomeInput, "assignmentId">): AssignmentsUpdate {
  if (estado === "renuncia") {
    return {
      estado_contacto: estado,
      preferred_slot_ids: [],
      attended: false,
      attended_slot_id: null,
      attended_at: new Date().toISOString(),
      attended_by: actor,
    };
  }
  // Reverting a renuncia ("puede revertirse volviendo a registrar el
  // contacto"): reset the ausente stamp so getSlotRoster's pending filter
  // (attended IS NULL) lists the family again (F185, gh #129). Any other
  // previous estado leaves the attended fields untouched — a re-contact must
  // never wipe a real attendance recorded at close-out.
  return {
    estado_contacto: estado,
    preferred_slot_ids: preferredSlotIds,
    ...(previousEstado === "renuncia"
      ? { attended: null, attended_slot_id: null, attended_at: null, attended_by: null }
      : {}),
  };
}

/**
 * Applies the shared outcome write for one assignment. Returns the
 * still-chainable update query so a caller can tack on its own
 * `.select(...).single()` for its own response shape — the write itself is
 * defined in exactly one place.
 */
export function applyContactoOutcome(db: SupabaseClient<Database>, input: ContactoOutcomeInput) {
  return db
    .from("delivery_round_assignments")
    .update(buildContactoOutcomeUpdate(input))
    .eq("id", input.assignmentId);
}
