import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import type { Json } from "../../../client/src/lib/database.types";
import { resolveRepresentatives } from "./reparto-helpers";
import { TurnoSchema } from "../../../shared/repartoSchemas";

interface SignedActaEntry { url: string; by: string; at: string }

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function fail(error: { message: string } | null): never {
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error?.message ?? "DB error" });
}

// Roster for one SLOT = (round, day, turno). Every sheet is per-turno.
async function slotAssignments(roundId: string, day: string, turno: string) {
  const db = createAdminClient();
  const { data, error } = await db
    .from("delivery_round_assignments")
    .select("family_id, expediente, total_miembros, kg_alimentos, kg_carne, assigned_day, turno")
    .eq("round_id", roundId)
    .eq("assigned_day", day)
    .eq("turno", turno)
    .order("expediente", { ascending: true });
  if (error) fail(error);
  const { data: round } = await db
    .from("delivery_rounds")
    .select("nombre, num_albaran_ba, num_factura_carne, logos")
    .eq("id", roundId)
    .single();
  const { data: slot } = await db
    .from("delivery_round_slots")
    .select("es_fuera_madrid")
    .eq("round_id", roundId)
    .eq("slot_date", day)
    .eq("turno", turno)
    .maybeSingle();
  return { db, rows: data ?? [], round, slot };
}

export const roundsDocumentsRouter = router({
  // Record the photographed SIGNED Hoja de Firmas for a SLOT (round, day, turno).
  // Photo bytes live in the private `family-documents` bucket (client uploads and
  // passes the path); here we store only path + audit (who/when) on the slot.
  attachSignedActa: adminProcedure
    .input(z.object({ round_id: uuid, slot_id: uuid, documento_url: z.string().min(1).max(500) }))
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { data: slot, error: se } = await db
        .from("delivery_round_slots")
        .select("id, round_id")
        .eq("id", input.slot_id)
        .eq("round_id", input.round_id)
        .single();
      if (se || !slot) throw new TRPCError({ code: "NOT_FOUND", message: "Turno no encontrado" });

      const entry: SignedActaEntry = { url: input.documento_url, by: String(ctx.user.id), at: new Date().toISOString() };
      const { error } = await db
        .from("delivery_round_slots")
        .update({ signed_acta: entry as unknown as Json })
        .eq("id", input.slot_id);
      if (error) fail(error);
      return { slot_id: input.slot_id };
    }),

  // Hoja de Firmas data (ADMIN only — includes DNI/NIE + phone for the acta).
  // PII is intentional here (Banco de Alimentos legal basis) and is never logged.
  getSigningRoster: adminProcedure
    .input(z.object({ round_id: uuid, assigned_day: isoDate, turno: TurnoSchema }))
    .query(async ({ input }) => {
      const { db, rows, round, slot } = await slotAssignments(input.round_id, input.assigned_day, input.turno);
      const familyIds = [...new Set(rows.map((r) => r.family_id))];
      const reps = await resolveRepresentatives(db, familyIds);
      const { data: fams } = await db
        .from("families")
        .select("id, familia_numero, num_adultos, num_menores_18")
        .in("id", familyIds.length ? familyIds : ["00000000-0000-0000-0000-000000000000"]);
      const famById = new Map((fams ?? []).map((f) => [f.id, f]));

      return {
        header: {
          nombre: round?.nombre ?? null,
          num_albaran_ba: round?.num_albaran_ba ?? null,
          num_factura_carne: round?.num_factura_carne ?? null,
          logos: round?.logos ?? [],
          fecha: input.assigned_day,
          turno: input.turno,
          num_familias: rows.length,
          es_fuera_madrid: slot?.es_fuera_madrid ?? false,
        },
        rows: rows.map((r) => {
          const rep = reps.get(r.family_id);
          const fam = famById.get(r.family_id);
          return {
            expediente: r.expediente,
            nombre: rep?.nombre ?? null,
            apellidos: rep?.apellidos ?? null,
            dni: rep?.numero_documento ?? null, // PII — acta only
            telefono: rep?.telefono ?? null,
            num_adultos: fam?.num_adultos ?? null,
            num_menores: fam?.num_menores_18 ?? null,
            total_miembros: r.total_miembros,
            kg_alimentos: r.kg_alimentos,
            kg_carne: r.kg_carne,
          };
        }),
      };
    }),

  // Listado interno (ADMIN) — nº familia, titular, nº miembros, teléfono, fecha
  // cita. NO DNI (allowlist: this list does not carry document numbers).
  getListadoInterno: adminProcedure
    .input(z.object({ round_id: uuid, assigned_day: isoDate, turno: TurnoSchema }))
    .query(async ({ input }) => {
      const { db, rows, round } = await slotAssignments(input.round_id, input.assigned_day, input.turno);
      const familyIds = [...new Set(rows.map((r) => r.family_id))];
      const reps = await resolveRepresentatives(db, familyIds);
      return {
        nombre: round?.nombre ?? null,
        fecha_cita: input.assigned_day,
        turno: input.turno,
        rows: rows.map((r) => {
          const rep = reps.get(r.family_id);
          return {
            expediente: r.expediente,
            titular: [rep?.nombre, rep?.apellidos].filter(Boolean).join(" ").trim() || null,
            num_miembros: r.total_miembros,
            telefono: rep?.telefono ?? null, // phone yes, DNI no
          };
        }),
      };
    }),
});
