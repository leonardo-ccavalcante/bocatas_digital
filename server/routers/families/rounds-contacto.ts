import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import type { Json } from "../../../client/src/lib/database.types";
import { notifyRepartoChange } from "./reparto-notify";
import { RescheduleSchema, SetContactoFamiliaSchema } from "../../../shared/repartoSchemas";

function fail(error: { message: string } | null): never {
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error?.message ?? "DB error" });
}
function failWrite(error: { message: string } | null): never {
  if (error?.message.includes("turno_cerrado") || error?.message.includes("ronda_cerrada"))
    throw new TRPCError({ code: "CONFLICT", message: "El turno está cerrado; no se puede modificar" });
  fail(error);
}

// Admin contact + reschedule lane for a reparto (kept apart from the voluntario
// close-out procedures so each file stays a single concern and under max-lines).
export const roundsContactoRouter = router({
  // Re-assign a pending family's SUGGESTED slot (moves day + turno). The RPC
  // rejects an already-resolved (attended) assignment and a closed target.
  rescheduleAssignment: adminProcedure
    .input(RescheduleSchema)
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { data: cur, error: fe } = await db
        .from("delivery_round_assignments")
        .select("id, family_id, round_id, assigned_day, turno")
        .eq("id", input.assignment_id)
        .single();
      if (fe || !cur) throw new TRPCError({ code: "NOT_FOUND", message: "Asignación no encontrada" });

      const logEntry = {
        from: `${cur.assigned_day} ${cur.turno}`,
        to: `${input.new_day} ${input.new_turno}`,
        motivo: input.motivo ?? null,
        at: new Date().toISOString(),
        by: String(ctx.user.id),
      };
      const { error } = await db.rpc("move_assignment_to_open_slot", {
        p_assignment_id: input.assignment_id,
        p_new_day: input.new_day,
        p_new_turno: input.new_turno,
        p_actor: String(ctx.user.id),
        p_log_entry: logEntry as unknown as Json,
      });
      if (error) {
        if (error.message.includes("asignacion_finalizada"))
          throw new TRPCError({ code: "CONFLICT", message: "No se puede reprogramar una asignación ya resuelta" });
        if (error.message.includes("turno_destino_cerrado"))
          throw new TRPCError({ code: "CONFLICT", message: "No se puede reasignar a un turno ya cerrado" });
        if (error.message.includes("turno_destino_inexistente"))
          throw new TRPCError({ code: "BAD_REQUEST", message: "El turno de destino no existe" });
        if (error.message.includes("asignacion_no_encontrada"))
          throw new TRPCError({ code: "NOT_FOUND", message: "Asignación no encontrada" });
        fail(error);
      }
      void notifyRepartoChange({ type: "reparto.reschedule", family_id: cur.family_id, round_id: cur.round_id, assigned_day: input.new_day });
      return { id: cur.id, round_id: cur.round_id, assigned_day: input.new_day, turno: input.new_turno, estado_contacto: "reprogramada" as const };
    }),

  // Contact outcome: record up to 2 preferred days, or an early renuncia. Renuncia
  // marks the family ausente for the round (attended=false, no attended_slot_id).
  setContactoFamilia: adminProcedure
    .input(SetContactoFamiliaSchema)
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      // Derive renuncia from the outcome — not a separate client flag — so the
      // stored state can never disagree with itself.
      const isRenuncia = input.estado_contacto === "renuncia";
      const preferred = isRenuncia ? [] : (input.preferred_slot_ids ?? []);

      // Validate every preferred slot belongs to the assignment's round; a foreign
      // or stale slot id would silently degrade fecha1/fecha2 to assigned_day.
      const { data: asg, error: ae } = await db
        .from("delivery_round_assignments")
        .select("round_id")
        .eq("id", input.assignment_id)
        .maybeSingle();
      if (ae || !asg) throw new TRPCError({ code: "NOT_FOUND", message: "Asignación no encontrada" });
      if (preferred.length > 0) {
        const { data: slots } = await db
          .from("delivery_round_slots")
          .select("id")
          .eq("round_id", asg.round_id);
        const valid = new Set((slots ?? []).map((s) => s.id));
        if (!preferred.every((id) => valid.has(id)))
          throw new TRPCError({ code: "BAD_REQUEST", message: "Un día preferido no pertenece a esta ronda" });
      }

      const { data, error } = await db
        .from("delivery_round_assignments")
        .update({
          estado_contacto: input.estado_contacto,
          preferred_slot_ids: preferred,
          ...(isRenuncia ? {
            attended: false,
            attended_slot_id: null,
            attended_at: new Date().toISOString(),
            attended_by: String(ctx.user.id),
          } : {}),
        })
        .eq("id", input.assignment_id)
        .select("id, estado_contacto, preferred_slot_ids, attended")
        .single();
      if (error) failWrite(error);
      return data;
    }),
});
