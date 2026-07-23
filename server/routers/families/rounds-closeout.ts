import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, voluntarioProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import type { Json } from "../../../client/src/lib/database.types";
import { resolveRepresentatives } from "./reparto-helpers";
import {
  GetSlotRosterSchema,
  MarkAttendanceAtSlotSchema,
  UndoAttendanceSchema,
  BulkMarkAttendanceSchema,
} from "../../../shared/repartoSchemas";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

function fail(error: { message: string } | null): never {
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error?.message ?? "DB error" });
}

// Attendance writes can be rejected by the guard trigger (20260723000001) when the
// slot is closed / the round is cerrada. Map those to a clean CONFLICT, not a 500.
function failWrite(error: { message: string } | null): never {
  if (error?.message.includes("turno_cerrado") || error?.message.includes("ronda_cerrada"))
    throw new TRPCError({ code: "CONFLICT", message: "El turno está cerrado; no se puede modificar la asistencia" });
  fail(error);
}

interface UndoEntry { prev: boolean | null; prev_slot_id: string | null; at: string; by: string }

const numExp = (e: string | null) => (e != null && e !== "" ? Number(e) : Number.POSITIVE_INFINITY);

export const roundsCloseoutRouter = router({
  // Close-out roster for ONE day's slot. Returns the slot plus ALL still-pending
  // families of the round (carry-over — a pending family shows on every open day),
  // smallest family first, and the families already attended in THIS slot.
  // VOLUNTARIO-visible → name + expediente only (no DNI/phone).
  getSlotRoster: voluntarioProcedure
    .input(GetSlotRosterSchema)
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data: slot, error: se } = await db
        .from("delivery_round_slots")
        .select("id, round_id, slot_date, turno, estado")
        .eq("id", input.slot_id)
        .single();
      if (se || !slot) throw new TRPCError({ code: "NOT_FOUND", message: "Turno no encontrado" });
      if (slot.round_id !== input.round_id)
        throw new TRPCError({ code: "BAD_REQUEST", message: "El turno no pertenece a esta ronda" });

      const { data, error } = await db
        .from("delivery_round_assignments")
        .select("id, family_id, assigned_day, turno, expediente, total_miembros, attended, attended_slot_id, estado_contacto")
        .eq("round_id", input.round_id);
      if (error) fail(error);
      const rows = data ?? [];

      const familyIds = [...new Set(rows.map((a) => a.family_id))];
      const reps = await resolveRepresentatives(db, familyIds);
      const nameOf = (fid: string) => {
        const rep = reps.get(fid);
        return rep ? [rep.nombre, rep.apellidos].filter(Boolean).join(" ").trim() || null : null;
      };

      const pending = rows
        .filter((a) => a.attended === null)
        .sort((a, b) => a.total_miembros - b.total_miembros || numExp(a.expediente) - numExp(b.expediente))
        .map((a) => ({
          id: a.id,
          family_id: a.family_id,
          expediente: a.expediente,
          total_miembros: a.total_miembros,
          nombre_titular: nameOf(a.family_id),
          titular_person_id: reps.get(a.family_id)?.person_id ?? null, // signer for the on-screen firma
          // Suggested for THIS day? (non-binding — any open day is valid)
          es_sugerido: a.assigned_day === slot.slot_date && a.turno === slot.turno,
        }));

      const attended_here = rows
        .filter((a) => a.attended_slot_id === input.slot_id)
        .map((a) => ({
          id: a.id,
          family_id: a.family_id,
          expediente: a.expediente,
          total_miembros: a.total_miembros,
          nombre_titular: nameOf(a.family_id),
          attended: a.attended,
        }));

      return { slot, pending, attended_here };
    }),

  // Resolve a scanned/searched person to their assignment in this round. Under the
  // flexible model any open day is valid, so a family whose suggested day differs
  // is still 'ready' (with es_dia_sugerido=false) — never rejected as wrong_slot.
  resolveAssignment: voluntarioProcedure
    .input(z.object({ round_id: uuid, person_id: uuid, slot_id: uuid }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data: slot, error: se } = await db
        .from("delivery_round_slots")
        .select("round_id, slot_date, turno")
        .eq("id", input.slot_id)
        .single();
      if (se || !slot) throw new TRPCError({ code: "NOT_FOUND", message: "Turno no encontrado" });
      if (slot.round_id !== input.round_id)
        throw new TRPCError({ code: "BAD_REQUEST", message: "El turno no pertenece a esta ronda" });

      const { data: members, error: me } = await db
        .from("familia_miembros")
        .select("familia_id, created_at")
        .eq("person_id", input.person_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1);
      if (me) fail(me); // a DB error must not masquerade as "not in program"
      const familyId = members?.[0]?.familia_id ?? null;
      if (!familyId) return { status: "not_in_program" as const };

      const { data: a, error: ae } = await db
        .from("delivery_round_assignments")
        .select("id, assigned_day, turno, attended")
        .eq("round_id", input.round_id)
        .eq("family_id", familyId)
        .maybeSingle();
      if (ae) fail(ae);
      if (!a) return { status: "not_in_round" as const, family_id: familyId };
      if (a.attended === true) return { status: "already_attended" as const, assignment_id: a.id };
      if (a.attended === false) return { status: "ausente" as const, assignment_id: a.id };
      return {
        status: "ready" as const,
        assignment_id: a.id,
        es_dia_sugerido: a.assigned_day === slot.slot_date && a.turno === slot.turno,
        suggested_day: a.assigned_day,
        suggested_turno: a.turno,
      };
    }),

  // Mark attended/no-show AT a specific slot (the actual pickup day, which may
  // differ from the suggested one). Stamps attended_slot_id + appends undo_log.
  markAttendance: voluntarioProcedure
    .input(MarkAttendanceAtSlotSchema)
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { data: cur, error: fe } = await db
        .from("delivery_round_assignments")
        .select("id, round_id, attended, attended_slot_id, undo_log")
        .eq("id", input.assignment_id)
        .single();
      if (fe || !cur) throw new TRPCError({ code: "NOT_FOUND", message: "Asignación no encontrada" });

      // Fence the slot to the assignment's round — otherwise a foreign slot_id would
      // stamp attended_slot_id cross-round and corrupt fecha_real on the acta.
      const { data: slot } = await db
        .from("delivery_round_slots")
        .select("round_id")
        .eq("id", input.slot_id)
        .maybeSingle();
      if (!slot || slot.round_id !== cur.round_id)
        throw new TRPCError({ code: "BAD_REQUEST", message: "El turno no pertenece a esta ronda" });

      const entry: UndoEntry = { prev: cur.attended ?? null, prev_slot_id: cur.attended_slot_id ?? null, at: new Date().toISOString(), by: String(ctx.user.id) };
      const undo_log = [...((cur.undo_log as unknown as UndoEntry[]) ?? []), entry];
      const { data, error } = await db
        .from("delivery_round_assignments")
        .update({ attended: input.attended, attended_slot_id: input.slot_id, attended_at: new Date().toISOString(), attended_by: String(ctx.user.id), undo_log: undo_log as unknown as Json })
        .eq("id", input.assignment_id)
        .select("id, round_id, attended")
        .single();
      if (error) failWrite(error);
      return data;
    }),

  undoAttendance: voluntarioProcedure
    .input(UndoAttendanceSchema)
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { data: cur, error: fe } = await db
        .from("delivery_round_assignments")
        .select("id, round_id, attended, attended_slot_id, undo_log")
        .eq("id", input.assignment_id)
        .single();
      if (fe || !cur) throw new TRPCError({ code: "NOT_FOUND", message: "Asignación no encontrada" });
      const log = (cur.undo_log as unknown as UndoEntry[]) ?? [];
      if (log.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nada que deshacer" });

      const last = log[log.length - 1];
      const entry: UndoEntry = { prev: cur.attended ?? null, prev_slot_id: cur.attended_slot_id ?? null, at: new Date().toISOString(), by: String(ctx.user.id) };
      const { data, error } = await db
        .from("delivery_round_assignments")
        .update({
          attended: last.prev,
          attended_slot_id: last.prev_slot_id,
          attended_at: last.prev !== null ? new Date().toISOString() : null,
          attended_by: last.prev !== null ? String(ctx.user.id) : null,
          undo_log: [...log, entry] as unknown as Json,
        })
        .eq("id", input.assignment_id)
        .select("id, round_id, attended")
        .single();
      if (error) failWrite(error);
      return data;
    }),

  // Bulk close-out (OCR confirm): mark many assignments attended AT a slot. Atomic
  // in the RPC — it locks the slot, fences to the round + open state, and updates
  // the whole batch with a per-row undo_log append (all-or-nothing).
  bulkMarkAttendance: voluntarioProcedure
    .input(BulkMarkAttendanceSchema)
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { data: count, error } = await db.rpc("bulk_mark_attendance", {
        p_round_id: input.round_id,
        p_slot_id: input.slot_id,
        p_ids: input.assignment_ids,
        p_attended: input.attended,
        p_actor: String(ctx.user.id),
      });
      if (error) {
        if (error.message.includes("slot_ajeno"))
          throw new TRPCError({ code: "BAD_REQUEST", message: "El turno no pertenece a esta ronda" });
        if (error.message.includes("turno_cerrado"))
          throw new TRPCError({ code: "CONFLICT", message: "El turno está cerrado" });
        fail(error);
      }
      return { count: count ?? 0 };
    }),

  // Absentismo feed: resolved (attended IS NOT NULL) rows, plus a pending count so
  // a mid-round dashboard can tell "not yet" (pendiente) from "ausente".
  getAbsentismoByRound: adminProcedure
    .input(z.object({ round_id: uuid }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("delivery_round_assignments")
        .select("family_id, assigned_day, turno, attended, total_miembros")
        .eq("round_id", input.round_id)
        .order("assigned_day", { ascending: true });
      if (error) fail(error);
      const rows = data ?? [];
      const resolved = rows.filter((r) => r.attended !== null);
      return {
        round_id: input.round_id,
        rows: resolved,
        summary: {
          total: resolved.length,
          attended: resolved.filter((r) => r.attended === true).length,
          no_show: resolved.filter((r) => r.attended === false).length,
          pending: rows.length - resolved.length,
        },
      };
    }),
});
