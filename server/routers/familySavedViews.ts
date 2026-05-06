import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../_core/trpc";
import { createAdminClient } from "../../client/src/lib/supabase/server";

/**
 * Zod schema for the saved-view filter set. Mirrors the FamiliasFilters shape
 * the Familias tab will use in client-side state.
 *
 * .strict() rejects unknown keys so saved views cannot smuggle arbitrary
 * fields that the UI doesn't know how to render or apply.
 */
export const FamiliasFiltersSpec = z
  .object({
    search: z.string().optional(),
    estado: z.enum(["activa", "baja", "all"]).optional(),
    sinGuf: z.boolean().optional(),
    sinInformeSocial: z.boolean().optional(),
    distrito: z.string().optional(), // Phase 2 hook
  })
  .strict();

export type FamiliasFilters = z.infer<typeof FamiliasFiltersSpec>;

const uuidLike = z.string().uuid();

export const familySavedViewsRouter = router({
  list: adminProcedure
    .input(z.object({ programaId: uuidLike }))
    .query(async ({ ctx, input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("family_saved_views")
        .select("*")
        .eq("programa_id", input.programaId)
        .or(`user_id.eq.${String(ctx.user.id)},is_shared.eq.true`)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return data ?? [];
    }),

  create: adminProcedure
    .input(
      z.object({
        programaId: uuidLike,
        nombre: z.string().min(1).max(100),
        descripcion: z.string().max(500).optional(),
        filtersJson: FamiliasFiltersSpec,
        isShared: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("family_saved_views")
        .insert({
          // user_id stores String(ctx.user.id) per existing pattern in dismissals.ts.
          // TODO(post-RLS-migration): if/when we move to Supabase JWT, this column
          // should hold the Supabase auth.uid() instead of the Drizzle int id.
          user_id: String(ctx.user.id),
          programa_id: input.programaId,
          nombre: input.nombre,
          descripcion: input.descripcion ?? null,
          filters_json: input.filtersJson,
          is_shared: input.isShared,
        })
        .select()
        .single();
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return data;
    }),

  update: adminProcedure
    .input(
      z.object({
        id: uuidLike,
        nombre: z.string().min(1).max(100).optional(),
        descripcion: z.string().max(500).optional(),
        filtersJson: FamiliasFiltersSpec.optional(),
        isShared: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = createAdminClient();
      const { id, ...rest } = input;
      const update: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (rest.nombre !== undefined) update.nombre = rest.nombre;
      if (rest.descripcion !== undefined) update.descripcion = rest.descripcion;
      if (rest.filtersJson !== undefined) update.filters_json = rest.filtersJson;
      if (rest.isShared !== undefined) update.is_shared = rest.isShared;
      const { data, error } = await db
        .from("family_saved_views")
        .update(update)
        .eq("id", id)
        .eq("user_id", String(ctx.user.id)) // server-side ownership guard
        .select()
        .single();
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return data;
    }),

  delete: adminProcedure
    .input(z.object({ id: uuidLike }))
    .mutation(async ({ ctx, input }) => {
      const db = createAdminClient();
      const { error } = await db
        .from("family_saved_views")
        .delete()
        .eq("id", input.id)
        .eq("user_id", String(ctx.user.id)); // server-side ownership guard
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { success: true };
    }),
});
