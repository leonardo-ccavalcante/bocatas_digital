import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { uuidLike } from "./_shared";
import { renderDocument, DocumentValidationError } from "../../services/documentService";
import { buildFamilyDataContext } from "../../services/documentContextBuilder";

export const documentsGenRouter = router({
  generateDocument: adminProcedure
    .input(
      z.object({
        family_id: uuidLike,
        slug: z.enum(["informe_social", "nota_entrega", "derivacion"] as const),
        session_id: uuidLike.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();

      let context: Awaited<ReturnType<typeof buildFamilyDataContext>>;
      try {
        context = await buildFamilyDataContext(db, input.family_id, {
          slug: input.slug,
          programSessionId: input.session_id,
        });
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Familia no encontrada",
        });
      }

      try {
        const result = await renderDocument(input.slug, context, {
          actorId: String(ctx.user.id),
          familyId: input.family_id,
        });
        return {
          bufferBase64: result.buffer.toString("base64"),
          fileName: result.fileName,
          mime: result.mime,
        };
      } catch (e) {
        if (e instanceof DocumentValidationError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: e.message,
            cause: e,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error inesperado al generar el documento",
        });
      }
    }),
});
