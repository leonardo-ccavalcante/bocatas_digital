/**
 * hojas.ts — derivar.startIntervention
 *
 * Returns a smart pre-fill payload for the Nueva Intervención form:
 *   - Header fields the user does NOT type (nombre, numUnidadFamiliar,
 *     programaNombre, profesionalNombre, fechaAperturaISO).
 *   - The existing active hoja id (if any); id=null + estado='new' if none.
 *   - Form defaults (fecha=today, others null).
 *
 * The actual hoja row is created on the first addIntervention call —
 * this procedure is read-only.
 */

import { TRPCError } from "@trpc/server";
import type { z } from "zod";

import { createAdminClient } from "../../../client/src/lib/supabase/server";
import {
  StartInterventionInputSchema,
  StartInterventionResultSchema,
} from "../../../shared/derivar/types";
import { router, adminProcedure } from "../../_core/trpc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveProfesionalNombre(user: { id: number; name: string | null }): string {
  return user.name ?? `Usuario ${String(user.id)}`;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const hojasRouter = router({
  /**
   * Pre-fill payload for the Nueva Intervención form.
   *
   * Looks up an existing active hoja for (entity, programa). If none exists,
   * returns hoja.id=null and estado='new'. The actual hoja row is created on
   * the first intervention insert (transactional — see addIntervention).
   */
  startIntervention: adminProcedure
    .input(StartInterventionInputSchema)
    .query(
      async ({
        ctx,
        input,
      }): Promise<z.infer<typeof StartInterventionResultSchema>> => {
        const db = createAdminClient();

        // 1. Resolve programa
        const { data: programa, error: progErr } = await db
          .from("programs")
          .select("id, name")
          .eq("id", input.programaId)
          .single();
        if (progErr || !programa) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Programa no encontrado",
          });
        }

        // 2. Resolve entity nombre + numUnidadFamiliar
        let nombre = "";
        let numUnidadFamiliar: string | null = null;

        if (input.scope === "persona") {
          const { data: p, error: pErr } = await db
            .from("persons")
            .select("id, nombre, apellidos")
            .eq("id", input.entityId)
            .single();
          if (pErr || !p) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Persona no encontrada",
            });
          }
          nombre = `${p.nombre} ${p.apellidos ?? ""}`.trim();

          // Check if this persona is the titular of a family
          const { data: asTitular } = await db
            .from("families")
            .select("familia_numero")
            .eq("titular_id", input.entityId)
            .is("deleted_at", null)
            .maybeSingle();
          if (asTitular) {
            numUnidadFamiliar = String(asTitular.familia_numero);
          } else {
            // Check if persona is a member of any family
            const { data: asMember } = await db
              .from("familia_miembros")
              .select("familia_id")
              .eq("person_id", input.entityId)
              .is("deleted_at", null)
              .limit(1)
              .maybeSingle();
            if (asMember) {
              const { data: fam } = await db
                .from("families")
                .select("familia_numero")
                .eq("id", asMember.familia_id)
                .maybeSingle();
              if (fam) numUnidadFamiliar = String(fam.familia_numero);
            }
          }
        } else {
          // scope === "familia"
          const { data: f, error: fErr } = await db
            .from("families")
            .select("id, familia_numero, titular_id")
            .eq("id", input.entityId)
            .single();
          if (fErr || !f) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Familia no encontrada",
            });
          }
          numUnidadFamiliar = String(f.familia_numero);

          if (f.titular_id) {
            const { data: titular } = await db
              .from("persons")
              .select("nombre, apellidos")
              .eq("id", f.titular_id)
              .maybeSingle();
            if (titular) {
              nombre = `${titular.nombre} ${titular.apellidos ?? ""}`.trim();
            }
          }
          if (!nombre) nombre = `Familia #${f.familia_numero}`;
        }

        // 3. Existing active hoja for (entity, programa), if any
        const hojaBaseQuery = db
          .from("derivacion_hojas")
          .select("id, fecha_apertura, estado")
          .eq("programa_id", input.programaId)
          .eq("estado", "activa")
          .eq("scope", input.scope);

        const hojaQuery =
          input.scope === "persona"
            ? hojaBaseQuery.eq("persona_id", input.entityId)
            : hojaBaseQuery.eq("familia_id", input.entityId);

        const { data: hoja } = await hojaQuery.maybeSingle();

        const today = new Date().toISOString().slice(0, 10);
        const profesionalNombre = resolveProfesionalNombre(ctx.user);

        const result: z.infer<typeof StartInterventionResultSchema> = {
          hoja: hoja
            ? {
                id: hoja.id,
                fechaApertura: hoja.fecha_apertura,
                estado: hoja.estado as "activa" | "cerrada",
              }
            : { id: null, fechaApertura: today, estado: "new" },
          header: {
            nombre,
            numUnidadFamiliar,
            programaNombre: programa.name,
            profesionalNombre,
            fechaAperturaISO: hoja?.fecha_apertura ?? today,
          },
          defaults: {
            fechaISO: today,
            tipoSlug: null,
            descripcion: null,
            observaciones: null,
          },
        };

        return StartInterventionResultSchema.parse(result);
      },
    ),
});
