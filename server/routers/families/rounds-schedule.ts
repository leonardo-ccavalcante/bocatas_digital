import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { uuidLike, programIdSchema } from "./_shared";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)");
const capModeSchema = z.enum(["people", "families"]);
const estadoRepartoSchema = z.enum(["borrador", "activa", "cerrada"]);

const createRepartoInput = z.object({
  program_id: programIdSchema,
  nombre: z.string().min(1).max(120),
  fecha_inicio: isoDate,
  dias_reparto: z.number().int().min(1).max(31),
  cap_mode: capModeSchema.default("people"),
  cap_per_day: z.number().int().positive().nullable().optional(),
  kg_total_alimentos: z.number().nonnegative().nullable().optional(),
  kg_total_carne: z.number().nonnegative().nullable().optional(),
  num_albaran_ba: z.string().max(120).optional(),
  num_factura_carne: z.string().max(120).optional(),
  logos: z.array(z.string()).max(4).default([]),
  notas: z.string().max(500).optional(),
});

const assignmentRowInput = z.object({
  family_id: uuidLike,
  assigned_day: isoDate,
  day_slot: z.number().int().min(1),
  preferred_day: isoDate.nullable().optional(),
  expediente: z.string().nullable(),
  total_miembros: z.number().int().min(1),
  kg_alimentos: z.number().nullable().optional(),
  kg_carne: z.number().nullable().optional(),
});

function fail(error: { message: string } | null): never {
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error?.message ?? "DB error" });
}

export const roundsScheduleRouter = router({
  // List rounds for a program (newest first).
  listRounds: adminProcedure
    .input(z.object({ program_id: programIdSchema, estado: estadoRepartoSchema.optional() }))
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

  // Create a reparto in borrador. creado_por is TEXT — String(numeric Manus id).
  createRound: adminProcedure
    .input(createRepartoInput)
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("delivery_rounds")
        .insert({
          program_id: input.program_id,
          nombre: input.nombre,
          fecha_inicio: input.fecha_inicio,
          dias_reparto: input.dias_reparto,
          cap_mode: input.cap_mode,
          cap_per_day: input.cap_per_day ?? null,
          kg_total_alimentos: input.kg_total_alimentos ?? null,
          kg_total_carne: input.kg_total_carne ?? null,
          num_albaran_ba: input.num_albaran_ba ?? null,
          num_factura_carne: input.num_factura_carne ?? null,
          logos: input.logos,
          notas: input.notas ?? null,
          estado: "borrador",
          creado_por: String(ctx.user.id),
        })
        .select()
        .single();
      if (error) fail(error);
      return data;
    }),

  // PRE-1 — families eligible for a reparto: active families with at least one
  // member enrolled (active) in the program. program_enrollments is person-keyed
  // (no family FK), so we hop person_id -> familia_miembros.familia_id -> families.
  getEligibleFamilies: adminProcedure
    .input(z.object({ program_id: programIdSchema }))
    .query(async ({ input }) => {
      const db = createAdminClient();

      const { data: enroll, error: e1 } = await db
        .from("program_enrollments")
        .select("person_id")
        .eq("program_id", input.program_id)
        .eq("estado", "activo")
        .is("deleted_at", null);
      if (e1) fail(e1);
      const personIds = [...new Set((enroll ?? []).map((r) => r.person_id).filter(Boolean))];
      if (personIds.length === 0) return [];

      const { data: members, error: e2 } = await db
        .from("familia_miembros")
        .select("familia_id")
        .in("person_id", personIds)
        .is("deleted_at", null);
      if (e2) fail(e2);
      const familyIds = [...new Set((members ?? []).map((r) => r.familia_id).filter(Boolean))];
      if (familyIds.length === 0) return [];

      const { data: fams, error: e3 } = await db
        .from("families")
        .select("id, familia_numero, num_adultos, num_menores_18")
        .in("id", familyIds)
        .eq("estado", "activa")
        .is("deleted_at", null);
      if (e3) fail(e3);

      return (fams ?? []).map((f) => ({
        id: f.id,
        familia_numero: f.familia_numero,
        total_miembros: (f.num_adultos ?? 1) + (f.num_menores_18 ?? 0),
      }));
    }),

  // Atomically replace this round's assignments and activate it (T1b RPC).
  commitAssignments: adminProcedure
    .input(z.object({ round_id: uuidLike, assignments: z.array(assignmentRowInput) }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();

      const { data: round, error: re } = await db
        .from("delivery_rounds")
        .select("id, estado")
        .eq("id", input.round_id)
        .is("deleted_at", null)
        .single();
      if (re || !round) throw new TRPCError({ code: "NOT_FOUND", message: "Ronda no encontrada" });
      // Only a borrador may be (re)committed. Committing wipes+reinserts
      // assignments via the RPC, which would destroy attended/undo_log on an
      // already-active round — so block anything past borrador.
      if (round.estado !== "borrador")
        throw new TRPCError({ code: "CONFLICT", message: "El reparto ya fue activado; no se puede regenerar la asignación" });

      const { data: count, error: rpcErr } = await db.rpc("commit_round_assignments", {
        p_round_id: input.round_id,
        p_rows: input.assignments,
      });
      if (rpcErr) fail(rpcErr);

      const { error: ue } = await db
        .from("delivery_rounds")
        .update({ estado: "activa" })
        .eq("id", input.round_id);
      if (ue) fail(ue);

      return { count: count ?? 0 };
    }),

  // Close an active round.
  closeRound: adminProcedure
    .input(z.object({ round_id: uuidLike, notas: z.string().max(500).optional() }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();
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
