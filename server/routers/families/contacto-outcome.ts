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
}

/**
 * The single source of truth for what a contacto outcome writes: a renuncia is
 * derived from `estado` (never a separate flag) and ALWAYS clears
 * preferred_slot_ids + stamps the assignment ausente — even if the caller
 * still holds stale preferred ids. Exported standalone so a call site that
 * must merge extra columns into the same single UPDATE (e.g. the n8n inbound
 * handler's reschedule_log) can still share this exact derivation.
 */
export function buildContactoOutcomeUpdate({
  estado,
  preferredSlotIds,
  actor,
}: Omit<ContactoOutcomeInput, "assignmentId">): AssignmentsUpdate {
  const isRenuncia = estado === "renuncia";
  return {
    estado_contacto: estado,
    preferred_slot_ids: isRenuncia ? [] : preferredSlotIds,
    ...(isRenuncia
      ? {
          attended: false,
          attended_slot_id: null,
          attended_at: new Date().toISOString(),
          attended_by: actor,
        }
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
