import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, superadminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import type { Database } from "../../../client/src/lib/database.types";

// Accepts any 8-4-4-4-12 hex UUID (including nil-adjacent test UUIDs like 00000000-...).
const uuidLike = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Must be a valid UUID",
);
const BUCKET = "program-document-templates";

export const programDocumentTypesTemplatesRouter = router({
  /** Returns a short-lived signed URL for a template/guide in the templates bucket. */
  signedUrl: protectedProcedure
    .input(z.object({
      path: z.string().min(1),
    }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db.storage
        .from(BUCKET)
        .createSignedUrl(input.path, 60 * 60); // 1 hour
      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "No se pudo generar la URL firmada",
        });
      }
      return { signedUrl: data.signedUrl };
    }),

  /**
   * Records that a new template/guide has been uploaded for a given doc type.
   * The upload itself is performed client-side via the Supabase JS client
   * (signed upload), and the resulting path is registered here.
   */
  registerUpload: superadminProcedure
    .input(z.object({
      docTypeId: uuidLike,
      kind: z.enum(["template", "guide"]),
      path: z.string().min(1),
      filename: z.string().min(1),
      version: z.string().min(1).max(20),
    }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const update: Database["public"]["Tables"]["program_document_types"]["Update"] = {
        updated_at: new Date().toISOString(),
      };
      if (input.kind === "template") {
        update.template_url = input.path;
        update.template_filename = input.filename;
        update.template_version = input.version;
      } else {
        update.guide_url = input.path;
        update.guide_filename = input.filename;
        update.guide_version = input.version;
      }
      const { data, error } = await db
        .from("program_document_types")
        .update(update)
        .eq("id", input.docTypeId)
        .select()
        .single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),
});
