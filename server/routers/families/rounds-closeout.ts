import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, voluntarioProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import type { Json } from "../../../client/src/lib/database.types";
import { resolveRepresentatives } from "./reparto-helpers";
import { notifyRepartoChange } from "./reparto-notify";
import {
  assignReparto,
  type Slot,
  type Turno,
  type FamilyForReparto,
} from "../../../client/src/features/familias-reparto/utils/assignReparto";
import { TurnoSchema } from "../../../shared/repartoSchemas";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function fail(error: { message: string } | null): never {
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error?.message ?? "DB error" });
}

interface UndoEntry { prev: boolean | null; at: string; by: string }

export const roundsCloseoutRouter = router({
  // Slot roster for close-out. VOLUNTARIO-visible → name + expediente only.
  // NO DNI / phone here (PII allowlist): the on-screen list never carries them.
  getAssignmentsForDay: voluntarioProcedure
    .input(z.object({ round_id: uuid, assigned_day: isoDate, turno: TurnoSchema }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("delivery_round_assignments")
        .select("id, family_id, assigned_day, turno, day_slot, expediente, total_miembros, attended, estado_contacto")
        .eq("round_id", input.round_id)
        .eq("assigned_day", input.assigned_day)
        .eq("turno", input.turno)
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
          turno: a.turno,
          day_slot: a.day_slot,
          expediente: a.expediente,
          total_miembros: a.total_miembros,
          attended: a.attended,
          estado_contacto: a.estado_contacto,
          nombre_titular: nombre || null, // name only — never DNI/phone
        };
      });
    }),

  // Resolve a scanned/searched person to their assignment in this round+slot.
  resolveAssignment: voluntarioProcedure
    .input(z.object({ round_id: uuid, person_id: uuid, current_day: isoDate, current_turno: TurnoSchema }))
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
        .select("id, assigned_day, turno, attended")
        .eq("round_id", input.round_id)
        .eq("family_id", familyId)
        .maybeSingle();
      if (!a) return { status: "not_in_round" as const, family_id: familyId };
      if (a.assigned_day !== input.current_day || a.turno !== input.current_turno)
        return {
          status: "wrong_slot" as const,
          assignment_id: a.id,
          expected_day: a.assigned_day,
          expected_turno: a.turno,
        };
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

  // Re-assign a family to another (OPEN) slot — moves day AND turno. Rejects a
  // closed target. Resets attendance (the family is now expected in the new slot).
  rescheduleAssignment: adminProcedure
    .input(z.object({ assignment_id: uuid, new_day: isoDate, new_turno: TurnoSchema, motivo: z.string().max(300).optional() }))
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
      // Atomic in the RPC: locks the TARGET slot and proves it is still 'abierto'
      // at write time, so a concurrent cerrarTurno can't strand this move in a
      // closed turno (which would leave attended=null uncounted by absentismo).
      const { error } = await db.rpc("move_assignment_to_open_slot", {
        p_assignment_id: input.assignment_id,
        p_new_day: input.new_day,
        p_new_turno: input.new_turno,
        p_actor: String(ctx.user.id),
        p_log_entry: logEntry as unknown as Json,
      });
      if (error) {
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

  // Bulk close-out: mark many assignments attended/no-show at once, scoped to the
  // round so stray ids can't flip attendance elsewhere.
  bulkMarkAttendance: voluntarioProcedure
    .input(z.object({ round_id: uuid, assignment_ids: z.array(uuid).min(1, "Lista vacía"), attended: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("delivery_round_assignments")
        .update({ attended: input.attended, attended_at: new Date().toISOString(), attended_by: String(ctx.user.id) })
        .eq("round_id", input.round_id)
        .in("id", input.assignment_ids)
        .select("id");
      if (error) fail(error);
      return { count: data?.length ?? 0 };
    }),

  // Carry pending / no-show families forward to the round's remaining OPEN slots.
  // Re-balances them across slots AFTER `from_slot` using the engine. Slot
  // ordinals are the true positions in the ordered list, so a closed slot in the
  // middle is skipped without mis-numbering anyone onto it.
  reassignPending: adminProcedure
    .input(z.object({ round_id: uuid, from_slot: z.object({ date: isoDate, turno: TurnoSchema }) }))
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { data: round, error: re } = await db
        .from("delivery_rounds")
        .select("estado")
        .eq("id", input.round_id)
        .single();
      if (re || !round) throw new TRPCError({ code: "NOT_FOUND", message: "Reparto no encontrado" });
      if (round.estado !== "activa") throw new TRPCError({ code: "CONFLICT", message: "El reparto no está activo" });

      const { data: slotRows, error: se } = await db
        .from("delivery_round_slots")
        .select("slot_date, turno, cap, estado")
        .eq("round_id", input.round_id)
        .order("slot_date", { ascending: true })
        .order("turno", { ascending: true });
      if (se) fail(se);
      const ordered = (slotRows ?? []).map((s, i) => ({ ...s, ordinal: i + 1 }));
      const fromIdx = ordered.findIndex((s) => s.slot_date === input.from_slot.date && s.turno === input.from_slot.turno);
      const fromOrdinal = fromIdx >= 0 ? ordered[fromIdx].ordinal : 0;

      const openRemaining: Slot[] = ordered
        .filter((s) => s.ordinal > fromOrdinal && s.estado === "abierto")
        .map((s) => ({ date: s.slot_date, turno: s.turno as Turno, ordinal: s.ordinal, cap: s.cap }));
      if (openRemaining.length === 0) return { moved: 0 };

      // Pending families sit in slots AT OR BEFORE the from_slot ordinal.
      const pastKeys = new Set(ordered.filter((s) => s.ordinal <= fromOrdinal).map((s) => `${s.slot_date}#${s.turno}`));
      const { data: pend, error: pe } = await db
        .from("delivery_round_assignments")
        .select("id, family_id, expediente, total_miembros, assigned_day, turno")
        .eq("round_id", input.round_id)
        .or("attended.is.null,attended.eq.false");
      if (pe) fail(pe);
      const pending = (pend ?? []).filter((p) => pastKeys.has(`${p.assigned_day}#${p.turno}`));
      if (pending.length === 0) return { moved: 0 };

      const families: FamilyForReparto[] = pending.map((p) => ({
        id: p.family_id,
        total_miembros: p.total_miembros,
        familia_numero: p.expediente ? Number(p.expediente) : null,
        preferred_day: null,
      }));
      const result = assignReparto(families, openRemaining);
      const bySlotFamily = new Map(result.assignments.map((a) => [a.family_id, a]));

      let moved = 0;
      const now = new Date().toISOString();
      const actor = String(ctx.user.id);
      for (const p of pending) {
        const a = bySlotFamily.get(p.family_id);
        if (!a) continue;
        const logEntry = {
          from: `${p.assigned_day} ${p.turno}`,
          to: `${a.assigned_day} ${a.turno}`,
          motivo: "reasignación automática",
          at: now,
          by: actor,
        };
        // Same atomic move as reschedule — proves the target slot is still open
        // at write time. A slot that closed mid-loop is skipped, not fatal.
        const { error: ue } = await db.rpc("move_assignment_to_open_slot", {
          p_assignment_id: p.id,
          p_new_day: a.assigned_day,
          p_new_turno: a.turno,
          p_actor: actor,
          p_log_entry: logEntry as unknown as Json,
        });
        if (ue) {
          if (ue.message.includes("turno_destino_cerrado")) continue;
          fail(ue);
        }
        moved += 1;
      }
      return { moved };
    }),

  // Absentismo feed for E8: only resolved (attended IS NOT NULL) rows. Pendientes
  // in a closed turno are already recorded as no-show (attended=false) by
  // cerrarTurno, so they are counted here; pendientes in still-open turnos are
  // correctly excluded (their turno hasn't happened yet).
  getAbsentismoByRound: adminProcedure
    .input(z.object({ round_id: uuid }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("delivery_round_assignments")
        .select("family_id, assigned_day, turno, attended, total_miembros")
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
