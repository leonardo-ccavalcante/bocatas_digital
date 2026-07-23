import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import type { Json } from "../../../client/src/lib/database.types";
import { esFueraDeMadrid } from "../../../shared/madrid/fueraDeMadrid";
import {
  assignReparto,
  computeKgPerFamily,
  type Slot,
  type Turno,
  type FamilyForReparto,
} from "../../../client/src/features/familias-reparto/utils/assignReparto";
import { ActivateRoundSchema, PreviewAssignmentsSchema } from "../../../shared/repartoSchemas";

function fail(error: { message: string } | null): never {
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error?.message ?? "DB error" });
}

interface RoundRow {
  estado: string;
  kg_total_alimentos: number | null;
  kg_total_carne: number | null;
}

// Load the round, its ordered slots, and ALL active families, then run the pure
// assignment engine over them. Deterministic — preview and activate produce the
// SAME rows, so the operator sees exactly what will be committed. Shared by both
// procedures below.
async function computePlan(round_id: string) {
  const db = createAdminClient();

  const { data: round, error: re } = await db
    .from("delivery_rounds")
    .select("estado, kg_total_alimentos, kg_total_carne")
    .eq("id", round_id)
    .is("deleted_at", null)
    .single<RoundRow>();
  if (re || !round) throw new TRPCError({ code: "NOT_FOUND", message: "Reparto no encontrado" });

  const { data: slotRows, error: se } = await db
    .from("delivery_round_slots")
    .select("slot_date, turno, cap, es_fuera_madrid")
    .eq("round_id", round_id)
    .order("slot_date", { ascending: true })
    .order("turno", { ascending: true });
  if (se) fail(se);
  const slots: Slot[] = (slotRows ?? []).map((s, i) => ({
    date: s.slot_date,
    turno: s.turno as Turno,
    ordinal: i + 1,
    cap: s.cap,
    esFueraMadrid: s.es_fuera_madrid ?? false,
  }));

  // ALL active families (server-authoritative — never a client-supplied list).
  const { data: famRows, error: fe } = await db.rpc("get_active_families_for_reparto");
  if (fe) fail(fe);
  const families: FamilyForReparto[] = (famRows ?? []).map((f) => ({
    id: f.id,
    total_miembros: f.total_miembros,
    familia_numero: f.familia_numero != null ? parseInt(f.familia_numero, 10) : null,
    esFueraMadrid: esFueraDeMadrid(f.codigo_postal),
  }));

  const totalPersonas = families.reduce((sum, f) => sum + f.total_miembros, 0);
  const result = assignReparto(families, slots);

  const kgAlim = round.kg_total_alimentos ?? 0;
  const kgCarne = round.kg_total_carne ?? 0;
  const rows = result.assignments.map((a) => ({
    family_id: a.family_id,
    assigned_day: a.assigned_day,
    turno: a.turno,
    day_slot: a.day_slot,
    expediente: a.expediente,
    total_miembros: a.total_miembros,
    kg_alimentos: computeKgPerFamily(kgAlim, totalPersonas, a.total_miembros),
    kg_carne: computeKgPerFamily(kgCarne, totalPersonas, a.total_miembros),
  }));

  return {
    estado: round.estado,
    rows,
    slotLoads: result.slotLoads,
    overCap: result.overCap,
    totals: { familias: families.length, personas: totalPersonas },
  };
}

export const roundsActivationRouter = router({
  // Read-only forecast of the suggested distribution (borrador only). The engine
  // is deterministic, so this equals what activateRound will commit.
  previewAssignments: adminProcedure
    .input(PreviewAssignmentsSchema)
    .query(async ({ input }) => {
      const plan = await computePlan(input.round_id);
      if (plan.estado !== "borrador")
        throw new TRPCError({ code: "CONFLICT", message: "El reparto ya fue activado" });
      return { slotLoads: plan.slotLoads, overCap: plan.overCap, totals: plan.totals };
    }),

  // Commit the suggested distribution and activate the round, atomically. The
  // family set is derived server-side (all active families) — the client sends
  // only the round id, closing the old "client uploads the rows" trust hole.
  activateRound: adminProcedure
    .input(ActivateRoundSchema)
    .mutation(async ({ input }) => {
      const plan = await computePlan(input.round_id);
      const db = createAdminClient();
      const { data: count, error } = await db.rpc("commit_round_assignments", {
        p_round_id: input.round_id,
        p_rows: plan.rows as unknown as Json,
      });
      if (error) {
        if (error.message.includes("ronda_ya_activada"))
          throw new TRPCError({ code: "CONFLICT", message: "El reparto ya fue activado" });
        if (error.message.includes("ronda_no_encontrada"))
          throw new TRPCError({ code: "NOT_FOUND", message: "Reparto no encontrado" });
        fail(error);
      }
      return { count: count ?? 0, overCap: plan.overCap, totals: plan.totals };
    }),
});
