import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, voluntarioProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import type { Json } from "../../../client/src/lib/database.types";
import { resolveRepresentatives } from "./reparto-helpers";
import { notifyRepartoChange } from "./reparto-notify";
import { reassignRemaining, repartoDays, type FamilyForReparto } from "../../../client/src/features/familias-reparto/utils/assignReparto";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function fail(error: { message: string } | null): never {
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error?.message ?? "DB error" });
}

interface UndoEntry { prev: boolean | null; at: string; by: string }

export const roundsCloseoutRouter = router({
  // Day roster for close-out. VOLUNTARIO-visible → name + expediente only.
  // NO DNI / phone here (PII allowlist): the on-screen list never carries them.
  getAssignmentsForDay: voluntarioProcedure
    .input(z.object({ round_id: uuid, assigned_day: isoDate }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("delivery_round_assignments")
        .select("id, family_id, assigned_day, day_slot, expediente, total_miembros, attended, estado_contacto")
        .eq("round_id", input.round_id)
        .eq("assigned_day", input.assigned_day)
        .order("expediente", { ascending: true });
      if (error) fail(error);

      const familyIds = [...new Set((data ?? []).map((a) => a.family_id))];
      const reps = await resolveRepresentatives(db, familyIds);
      return (data ?? []).map((a) => {
        const rep = reps.get(a.family_id);
        const nombre = rep ? [rep.nombre, rep.apellidos].filter(Boolean).join(" ").trim() : "";
        return {
          id: a.id,
          family_id: a.family_id,
          assigned_day: a.assigned_day,
          day_slot: a.day_slot,
          expediente: a.expediente,
          total_miembros: a.total_miembros,
          attended: a.attended,
          estado_contacto: a.estado_contacto,
          nombre_titular: nombre || null, // name only — never DNI/phone
        };
      });
    }),

  // Resolve a scanned/searched person to their assignment in this round+day.
  resolveAssignment: voluntarioProcedure
    .input(z.object({ round_id: uuid, person_id: uuid, current_day: isoDate }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      // person_id has no UNIQUE constraint on familia_miembros — a person can
      // appear in >1 family record — so take the earliest match rather than
      // .maybeSingle() (which throws on multiple rows mid-scan).
      const { data: members } = await db
        .from("familia_miembros")
        .select("familia_id, created_at")
        .eq("person_id", input.person_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1);
      const familyId = members?.[0]?.familia_id ?? null;
      if (!familyId) return { status: "not_in_program" as const };

      const { data: a } = await db
        .from("delivery_round_assignments")
        .select("id, assigned_day, attended")
        .eq("round_id", input.round_id)
        .eq("family_id", familyId)
        .maybeSingle();
      if (!a) return { status: "not_in_round" as const, family_id: familyId };
      if (a.assigned_day !== input.current_day)
        return { status: "wrong_day" as const, assignment_id: a.id, expected_day: a.assigned_day };
      if (a.attended === true) return { status: "already_attended" as const, assignment_id: a.id };
      return { status: "ready" as const, assignment_id: a.id };
    }),

  // Mark attended/no-show, appending to the undo_log audit trail.
  markAttendance: voluntarioProcedure
    .input(z.object({ assignment_id: uuid, attended: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { data: cur, error: fe } = await db
        .from("delivery_round_assignments")
        .select("id, round_id, attended, undo_log")
        .eq("id", input.assignment_id)
        .single();
      if (fe || !cur) throw new TRPCError({ code: "NOT_FOUND", message: "Asignación no encontrada" });

      const entry: UndoEntry = { prev: cur.attended ?? null, at: new Date().toISOString(), by: String(ctx.user.id) };
      const undo_log = [...((cur.undo_log as unknown as UndoEntry[]) ?? []), entry];
      const { data, error } = await db
        .from("delivery_round_assignments")
        .update({ attended: input.attended, attended_at: new Date().toISOString(), attended_by: String(ctx.user.id), undo_log: undo_log as unknown as Json })
        .eq("id", input.assignment_id)
        .select("id, round_id, attended")
        .single();
      if (error) fail(error);
      return data;
    }),

  undoAttendance: voluntarioProcedure
    .input(z.object({ assignment_id: uuid }))
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { data: cur, error: fe } = await db
        .from("delivery_round_assignments")
        .select("id, round_id, attended, undo_log")
        .eq("id", input.assignment_id)
        .single();
      if (fe || !cur) throw new TRPCError({ code: "NOT_FOUND", message: "Asignación no encontrada" });
      const log = (cur.undo_log as unknown as UndoEntry[]) ?? [];
      if (log.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nada que deshacer" });

      const restored = log[log.length - 1].prev;
      const entry: UndoEntry = { prev: cur.attended ?? null, at: new Date().toISOString(), by: String(ctx.user.id) };
      const { data, error } = await db
        .from("delivery_round_assignments")
        .update({
          attended: restored,
          attended_at: restored !== null ? new Date().toISOString() : null,
          attended_by: restored !== null ? String(ctx.user.id) : null,
          undo_log: [...log, entry] as unknown as Json,
        })
        .eq("id", input.assignment_id)
        .select("id, round_id, attended")
        .single();
      if (error) fail(error);
      return data;
    }),

  // Move a family to another day (no-answer / agreed change). Records the move
  // and pins preferred_day so re-balancing keeps the family on the new day.
  rescheduleAssignment: adminProcedure
    .input(z.object({ assignment_id: uuid, new_day: isoDate, motivo: z.string().max(300).optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { data: cur, error: fe } = await db
        .from("delivery_round_assignments")
        .select("id, family_id, round_id, assigned_day, reschedule_log")
        .eq("id", input.assignment_id)
        .single();
      if (fe || !cur) throw new TRPCError({ code: "NOT_FOUND", message: "Asignación no encontrada" });

      const log = [
        ...((cur.reschedule_log as unknown[]) ?? []),
        { from: cur.assigned_day, to: input.new_day, motivo: input.motivo ?? null, at: new Date().toISOString(), by: String(ctx.user.id) },
      ];
      const { data, error } = await db
        .from("delivery_round_assignments")
        .update({ assigned_day: input.new_day, preferred_day: input.new_day, estado_contacto: "reprogramada", reschedule_log: log as unknown as Json })
        .eq("id", input.assignment_id)
        .select("id, round_id, assigned_day, estado_contacto")
        .single();
      if (error) fail(error);
      // Best-effort cita notification (IDs only, no PII; no-op without config).
      if (data) void notifyRepartoChange({ type: "reparto.reschedule", family_id: cur.family_id, round_id: data.round_id, assigned_day: input.new_day });
      return data;
    }),

  setContactEstado: adminProcedure
    .input(z.object({ assignment_id: uuid, estado_contacto: z.enum(["pendiente", "confirmada", "no_contesta", "reprogramada"]) }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("delivery_round_assignments")
        .update({ estado_contacto: input.estado_contacto })
        .eq("id", input.assignment_id)
        .select("id, estado_contacto")
        .single();
      if (error) fail(error);
      return data;
    }),

  // Bulk close-out: mark many assignments attended/no-show at once. The kg per
  // family is already snapshotted on the row, so this records "delivered, this
  // day, this family, this amount" without re-deriving anything. Used by a
  // "mark all signed" UI and (later) by an OCR-assisted confirm flow.
  bulkMarkAttendance: voluntarioProcedure
    .input(z.object({ round_id: uuid, assignment_ids: z.array(uuid).min(1, "Lista vacía"), attended: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      // Scope the update to the round (RLS is bypassed via the service-role
      // client): only rows that belong to round_id are touched, so a caller
      // can't flip attendance on arbitrary assignments by passing stray ids.
      const { data, error } = await db
        .from("delivery_round_assignments")
        .update({ attended: input.attended, attended_at: new Date().toISOString(), attended_by: String(ctx.user.id) })
        .eq("round_id", input.round_id)
        .in("id", input.assignment_ids)
        .select("id");
      if (error) fail(error);
      return { count: data?.length ?? 0 };
    }),

  // Carry pending / no-show families forward to the round's remaining days.
  // Re-balances those families across days after `from_day` using the engine.
  reassignPending: adminProcedure
    .input(z.object({ round_id: uuid, from_day: isoDate }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { data: round, error: re } = await db
        .from("delivery_rounds")
        .select("fecha_inicio, dias_reparto, cap_per_day, estado")
        .eq("id", input.round_id)
        .single();
      if (re || !round) throw new TRPCError({ code: "NOT_FOUND", message: "Reparto no encontrado" });
      if (round.estado !== "activa") throw new TRPCError({ code: "CONFLICT", message: "El reparto no está activo" });

      const days = repartoDays(round.fecha_inicio, round.dias_reparto);
      const fromSlot = days.indexOf(input.from_day) + 1; // 1-based; 0 if not found → from start
      const { data: pend, error: pe } = await db
        .from("delivery_round_assignments")
        .select("id, family_id, expediente, total_miembros")
        .eq("round_id", input.round_id)
        .or("attended.is.null,attended.eq.false")
        .lte("assigned_day", input.from_day);
      if (pe) fail(pe);
      const pending = pend ?? [];
      if (pending.length === 0) return { moved: 0 };

      const families: FamilyForReparto[] = pending.map((p) => ({
        id: p.family_id,
        total_miembros: p.total_miembros,
        familia_numero: p.expediente ? Number(p.expediente) : null,
        preferred_day: null,
      }));
      const result = reassignRemaining(families, days, Math.max(0, fromSlot), { capPerDay: round.cap_per_day });
      const newDayByFamily = new Map(result.assignments.map((a) => [a.family_id, a.assigned_day]));

      let moved = 0;
      for (const p of pending) {
        const newDay = newDayByFamily.get(p.family_id);
        if (!newDay) continue;
        const { error: ue } = await db
          .from("delivery_round_assignments")
          .update({ assigned_day: newDay, preferred_day: newDay, estado_contacto: "reprogramada" })
          .eq("id", p.id);
        if (ue) fail(ue);
        moved += 1;
      }
      return { moved };
    }),

  // Absentismo feed for E8: only closed (attended IS NOT NULL) rows.
  getAbsentismoByRound: adminProcedure
    .input(z.object({ round_id: uuid }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("delivery_round_assignments")
        .select("family_id, assigned_day, attended, total_miembros")
        .eq("round_id", input.round_id)
        .not("attended", "is", null)
        .order("assigned_day", { ascending: true });
      if (error) fail(error);
      const rows = data ?? [];
      return {
        round_id: input.round_id,
        rows,
        summary: {
          total: rows.length,
          attended: rows.filter((r) => r.attended === true).length,
          no_show: rows.filter((r) => r.attended === false).length,
        },
      };
    }),
});
