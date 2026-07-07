import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { uuidLike, programIdSchema } from "./_shared";
import {
  CrearRepartoSchema,
  CommitAssignmentsSchema,
  CerrarTurnoSchema,
  EstadoRepartoSchema,
} from "../../../shared/repartoSchemas";
import { esFueraDeMadrid } from "../../../shared/madrid/fueraDeMadrid";

function fail(error: { message: string } | null): never {
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error?.message ?? "DB error" });
}

export const roundsScheduleRouter = router({
  // List rounds for a program (newest first).
  listRounds: adminProcedure
    .input(z.object({ program_id: programIdSchema, estado: EstadoRepartoSchema.optional() }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      let q = db
        .from("delivery_rounds")
        .select("*")
        .eq("program_id", input.program_id)
        .is("deleted_at", null)
        .order("fecha_inicio", { ascending: false });
      if (input.estado) q = q.eq("estado", input.estado);
      const { data, error } = await q;
      if (error) fail(error);
      return data ?? [];
    }),

  // Create a reparto (borrador) together with its (date, turno) slots, atomically.
  // fecha_inicio is derived server-side = the earliest slot date (kept for the
  // listRounds sort). creado_por is TEXT — String(numeric Manus id).
  createRound: adminProcedure
    .input(CrearRepartoSchema)
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const fecha_inicio = input.slots.reduce(
        (min, s) => (s.slot_date < min ? s.slot_date : min),
        input.slots[0].slot_date,
      );
      const { data, error } = await db.rpc("create_round_with_slots", {
        p_round: {
          program_id: input.program_id,
          nombre: input.nombre,
          fecha_inicio,
          kg_total_alimentos: input.kg_total_alimentos ?? null,
          kg_total_carne: input.kg_total_carne ?? null,
          num_albaran_ba: input.num_albaran_ba ?? null,
          num_factura_carne: input.num_factura_carne ?? null,
          logos: input.logos,
          creado_por: String(ctx.user.id),
          notas: input.notas ?? null,
        },
        p_slots: input.slots.map((s) => ({
          slot_date: s.slot_date,
          turno: s.turno,
          cap: s.cap ?? null,
          es_fuera_madrid: s.es_fuera_madrid ?? false,
        })),
      });
      if (error) fail(error);
      return { id: data as string };
    }),

  // The (date, turno) slot agenda for a round, ordered; `ordinal` is the 1-based
  // position — the same ordering the engine and commit use for day_slot.
  listSlots: adminProcedure
    .input(z.object({ round_id: uuidLike }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("delivery_round_slots")
        .select("id, slot_date, turno, cap, estado, cerrado_at, signed_acta, es_fuera_madrid")
        .eq("round_id", input.round_id)
        .order("slot_date", { ascending: true })
        .order("turno", { ascending: true });
      if (error) fail(error);
      return (data ?? []).map((s, i) => ({ ...s, ordinal: i + 1 }));
    }),

  // PRE-1 — families eligible for a reparto: active families with at least one
  // member enrolled (active) in the program.
  // Uses a single SQL RPC to avoid PostgREST .in() array size limits (fails at ~100+ items).
  getEligibleFamilies: adminProcedure
    .input(z.object({ program_id: programIdSchema }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db.rpc("get_eligible_families_for_reparto", {
        p_program_id: input.program_id,
      });
      if (error) fail(error);
      const rows = data ?? [];
      return rows.map((f) => ({
        id: f.id,
        familia_numero: f.familia_numero != null ? parseInt(f.familia_numero, 10) : null,
        total_miembros: f.total_miembros,
        // Derived (hybrid): a valid CP outside Madrid municipality. Empty CPs are
        // "unknown" → false; the operator covers those with the manual count.
        es_fuera_madrid: esFueraDeMadrid(f.codigo_postal),
      }));
    }),

  // Atomically replace this round's assignments (carrying turno) and activate it.
  // The RPC locks the round, re-checks 'borrador', wipes+reinserts and activates
  // in one transaction — two concurrent commits serialize, the loser is rejected
  // instead of silently overwriting the winner.
  commitAssignments: adminProcedure
    .input(CommitAssignmentsSchema)
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { data: count, error } = await db.rpc("commit_round_assignments", {
        p_round_id: input.round_id,
        p_rows: input.assignments,
      });
      if (error) {
        if (error.message.includes("ronda_ya_activada"))
          throw new TRPCError({ code: "CONFLICT", message: "El reparto ya fue activado; no se puede regenerar la asignación" });
        if (error.message.includes("ronda_no_encontrada"))
          throw new TRPCError({ code: "NOT_FOUND", message: "Ronda no encontrada" });
        fail(error);
      }
      return { count: count ?? 0 };
    }),

  // Close a single turno (slot). Remaining pendientes in that slot (attended IS
  // NULL) become explicit no-shows so the absentismo metric counts them — a
  // family should be re-assigned to another open turno BEFORE its turno closes.
  cerrarTurno: adminProcedure
    .input(CerrarTurnoSchema)
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      // Atomic in the RPC: closes the slot AND marks its pendientes (attended IS
      // NULL) as no-show, in one transaction, under a row lock.
      const { error } = await db.rpc("cerrar_turno", {
        p_slot_id: input.slot_id,
        p_actor: String(ctx.user.id),
      });
      if (error) {
        if (error.message.includes("turno_ya_cerrado"))
          throw new TRPCError({ code: "CONFLICT", message: "El turno ya está cerrado" });
        if (error.message.includes("ronda_no_activa"))
          throw new TRPCError({ code: "CONFLICT", message: "El reparto no está activo" });
        if (error.message.includes("turno_no_encontrado"))
          throw new TRPCError({ code: "NOT_FOUND", message: "Turno no encontrado" });
        fail(error);
      }
      return { closed: true };
    }),

  // Delete a reparto (any estado — the product allows it, and it's audit-logged).
  // SOFT delete only: the round drops out of listRounds (which filters deleted_at),
  // and its slots + assignments (including attendance history) are intentionally
  // KEPT. A soft delete must not destroy that history; the child rows are
  // unreachable once the round is hidden (the UI only reaches slots via a
  // non-deleted round), so they are harmless — not orphans to cascade away.
  deleteRound: adminProcedure
    .input(z.object({ round_id: uuidLike }))
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { data: round, error: re } = await db
        .from("delivery_rounds")
        .select("id, estado, nombre")
        .eq("id", input.round_id)
        .is("deleted_at", null)
        .single();
      if (re || !round) throw new TRPCError({ code: "NOT_FOUND", message: "Reparto no encontrado" });
      const { error } = await db
        .from("delivery_rounds")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.round_id);
      if (error) fail(error);
      await db.from("delivery_rounds_audit_log").insert({
        action: "delete_round",
        round_id: input.round_id,
        round_nombre: (round as { nombre?: string }).nombre ?? null,
        round_estado: round.estado,
        actor_id: ctx.user.openId,
        actor_name: ctx.user.name ?? null,
        metadata: { program_id: null },
      });
      return { deleted: true };
    }),

  // Close an active round — only once EVERY slot (turno of every day) is closed.
  closeRound: adminProcedure
    .input(z.object({ round_id: uuidLike, notas: z.string().max(500).optional() }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      // Completion gate: the reparto is complete only when no slot is still open.
      const { count, error: ce } = await db
        .from("delivery_round_slots")
        .select("id", { count: "exact", head: true })
        .eq("round_id", input.round_id)
        .eq("estado", "abierto");
      if (ce) fail(ce);
      if ((count ?? 0) > 0)
        throw new TRPCError({
          code: "CONFLICT",
          message: `Faltan ${count} turno(s) por cerrar antes de cerrar el reparto`,
        });

      const { data, error } = await db
        .from("delivery_rounds")
        .update({ estado: "cerrada", notas: input.notas ?? null })
        .eq("id", input.round_id)
        .eq("estado", "activa")
        .select()
        .single();
      if (error) fail(error);
      if (!data) throw new TRPCError({ code: "CONFLICT", message: "Ronda no activa o no encontrada" });
      return data;
    }),
});
