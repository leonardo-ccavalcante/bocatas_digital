import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, superadminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";

const slugSchema = z.enum(["informe_social", "nota_entrega", "derivacion"]);

export const templateEditorRouter = router({
  /**
   * publishTemplate — create a new versioned template for a given slug.
   * Deactivates the previously active version, then inserts the new one.
   * Superadmin only.
   */
  publishTemplate: superadminProcedure
    .input(
      z.object({
        slug: slugSchema,
        nombre: z.string().min(1).max(120),
        storage_path: z.string().min(1),
        logos: z.array(z.string()).default([]),
        static_blocks: z.record(z.string(), z.string()).default({}),
        placeholders: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();

      // 1. Find current max version for this slug
      const { data: existing } = await db
        .from("document_templates")
        .select("id, version")
        .eq("slug", input.slug)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextVersion = (existing?.version ?? 0) + 1;

      // 2. Deactivate the currently active row (if one exists)
      if (existing) {
        await db
          .from("document_templates")
          .update({ is_active: false, updated_by: String(ctx.user.id) })
          .eq("slug", input.slug)
          .eq("is_active", true);
      }

      // 3. Insert the new active version
      const { data, error } = await db
        .from("document_templates")
        .insert({
          slug: input.slug,
          nombre: input.nombre,
          version: nextVersion,
          storage_path: input.storage_path,
          logos: input.logos,
          static_blocks: input.static_blocks,
          placeholders: input.placeholders,
          is_active: true,
          created_by: String(ctx.user.id),
        })
        .select("id, slug, version, is_active")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Error al publicar plantilla",
        });
      }

      return data;
    }),

  /**
   * listTemplateVersions — list all versions of a given slug, newest first.
   * Superadmin only.
   */
  listTemplateVersions: superadminProcedure
    .input(z.object({ slug: slugSchema }))
    .query(async ({ input }) => {
      const db = createAdminClient();

      const { data, error } = await db
        .from("document_templates")
        .select("id, slug, nombre, version, is_active, created_by, created_at")
        .eq("slug", input.slug)
        .order("version", { ascending: false });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data ?? [];
    }),
});
