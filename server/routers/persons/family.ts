import { z } from "zod";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { protectedProcedure, router } from "../../_core/trpc";
import { mirrorMembersToTable, insertFamilyRow } from "../families";

export const familyRouter = router({
  createFamily: protectedProcedure
    .input(z.object({
      titularId: z.string().uuid(),
      miembros: z.array(z.object({
        nombre: z.string().min(1),
        apellidos: z.string().min(1),
        fecha_nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        sexo: z.string().optional().nullable(),
        tipo_documento: z.string().optional().nullable(),
        numero_documento: z.string().optional().nullable(),
        pais: z.string().optional().nullable(),
        parentesco: z.string().optional().nullable(),
      })).optional().default([]),
      numAdultos: z.number().int().min(1).default(1),
      numMenores: z.number().int().min(0).default(0),
    }))
    .mutation(async ({ input, ctx }) => {
      const supabase = createAdminClient();
      const data = await insertFamilyRow(
        supabase,
        ctx,
        {
          titular_id: input.titularId,
          // miembros JSON column was dropped (migration 20260505000005);
          // members live in familia_miembros — written below.
          num_miembros: input.numAdultos + input.numMenores,
          num_adultos: input.numAdultos,
          num_menores_18: input.numMenores,
          estado: "activa",
        },
        { titularId: input.titularId, numMiembros: input.miembros.length }
      );

      // Members live in familia_miembros — table is the canonical store.
      await mirrorMembersToTable(supabase, ctx, data.id, input.miembros);

      return { id: data.id, familia_numero: data.familia_numero };
    }),
});
