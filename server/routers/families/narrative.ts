import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { uuidLike } from "./_shared";
import { composeSituacionFamiliar } from "../../services/narrativeComposer";

// Mutations for the «DESCRIPCIÓN SITUACIÓN FAMILIAR» valoración narrative
// (stored on families.situacion_familiar_texto — Art.9, admin-only).
//
// composeNarrativeDraft RETURNS a draft but does NOT persist it: the UI
// pre-fills the editable textarea and the coordinator saves via updateNarrative.
// This guarantees no silent clobber of an existing (e.g. CSV-imported) narrative.
export const narrativeRouter = router({
  updateNarrative: adminProcedure
    .input(z.object({ id: uuidLike, situacion_familiar_texto: z.string().max(20000) }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { error } = await db
        .from("families")
        .update({ situacion_familiar_texto: input.situacion_familiar_texto })
        .eq("id", input.id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { ok: true };
    }),

  composeNarrativeDraft: adminProcedure
    .input(z.object({ id: uuidLike }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { data: family, error } = await db
        .from("families")
        .select(
          `num_adultos, num_menores_18, distrito,
           persons!titular_id(pais_origen, fecha_llegada_espana, tipo_vivienda,
                              situacion_laboral, nivel_ingresos, nivel_estudios,
                              empadronado, observaciones, necesidades_principales,
                              restricciones_alimentarias)`,
        )
        .eq("id", input.id)
        .is("deleted_at", null)
        .single();
      if (error || !family) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Familia no encontrada" });
      }

      const { data: followUps } = await db
        .from("family_follow_ups")
        .select("fecha, notas")
        .eq("family_id", input.id)
        .is("deleted_at", null)
        .order("fecha", { ascending: false })
        .limit(5);

      const t = Array.isArray(family.persons) ? family.persons[0] : family.persons;

      const draft = composeSituacionFamiliar({
        familia: {
          num_adultos: family.num_adultos,
          num_menores_18: family.num_menores_18,
          distrito: family.distrito,
        },
        titular: {
          pais_origen: t?.pais_origen ?? null,
          fecha_llegada_espana: t?.fecha_llegada_espana ?? null,
          tipo_vivienda: t?.tipo_vivienda ?? null,
          situacion_laboral: t?.situacion_laboral ?? null,
          nivel_ingresos: t?.nivel_ingresos ?? null,
          nivel_estudios: t?.nivel_estudios ?? null,
          empadronado: t?.empadronado ?? null,
          observaciones: t?.observaciones ?? null,
          necesidades_principales: t?.necesidades_principales ?? null,
          restricciones_alimentarias: t?.restricciones_alimentarias ?? null,
        },
        followUps: (followUps ?? []).map((f) => ({ fecha: f.fecha, notas: f.notas })),
      });

      return { draft };
    }),
});
