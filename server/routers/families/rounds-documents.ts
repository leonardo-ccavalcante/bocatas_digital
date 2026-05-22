import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import type { Json } from "../../../client/src/lib/database.types";
import { resolveRepresentatives } from "./reparto-helpers";

interface SignedActaEntry { url: string; by: string; at: string }

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function fail(error: { message: string } | null): never {
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error?.message ?? "DB error" });
}

async function dayAssignments(roundId: string, day: string) {
  const db = createAdminClient();
  const { data, error } = await db
    .from("delivery_round_assignments")
    .select("family_id, expediente, total_miembros, kg_alimentos, kg_carne, assigned_day")
    .eq("round_id", roundId)
    .eq("assigned_day", day)
    .order("expediente", { ascending: true });
  if (error) fail(error);
  const { data: round } = await db
    .from("delivery_rounds")
    .select("nombre, num_albaran_ba, num_factura_carne, logos, fecha_inicio")
    .eq("id", roundId)
    .single();
  return { db, rows: data ?? [], round };
}

export const roundsDocumentsRouter = router({
  // T-Doc-3: record the photographed SIGNED Hoja de Firmas for a (round, day).
  // Photo bytes live in the private `family-documents` bucket (client uploads
  // and passes the path); here we store only path + audit (who/when). Admin-only.
  attachSignedActa: adminProcedure
    .input(z.object({ round_id: uuid, assigned_day: isoDate, documento_url: z.string().min(1).max(500) }))
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { data: round, error: re } = await db
        .from("delivery_rounds")
        .select("signed_actas")
        .eq("id", input.round_id)
        .is("deleted_at", null)
        .single();
      if (re || !round) throw new TRPCError({ code: "NOT_FOUND", message: "Reparto no encontrado" });

      const current = (round.signed_actas as Record<string, SignedActaEntry> | null) ?? {};
      const next: Record<string, SignedActaEntry> = {
        ...current,
        [input.assigned_day]: { url: input.documento_url, by: String(ctx.user.id), at: new Date().toISOString() },
      };
      const { error } = await db
        .from("delivery_rounds")
        .update({ signed_actas: next as unknown as Json })
        .eq("id", input.round_id);
      if (error) fail(error);
      return { assigned_day: input.assigned_day };
    }),


  // Hoja de Firmas data (ADMIN only — includes DNI/NIE + phone for the acta).
  // PII is intentional here (Banco de Alimentos legal basis) and is never logged.
  getSigningRoster: adminProcedure
    .input(z.object({ round_id: uuid, assigned_day: isoDate }))
    .query(async ({ input }) => {
      const { db, rows, round } = await dayAssignments(input.round_id, input.assigned_day);
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
          num_familias: rows.length,
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
    .input(z.object({ round_id: uuid, assigned_day: isoDate }))
    .query(async ({ input }) => {
      const { db, rows, round } = await dayAssignments(input.round_id, input.assigned_day);
      const familyIds = [...new Set(rows.map((r) => r.family_id))];
      const reps = await resolveRepresentatives(db, familyIds);
      return {
        nombre: round?.nombre ?? null,
        fecha_cita: input.assigned_day,
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
