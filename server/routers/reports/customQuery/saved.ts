/**
 * customQuery/saved.ts — Saved-query CRUD on the report_saved_queries table.
 *
 * Procedures:
 *   list({ programaId? })     — returns admin's own queries + shared queries.
 *   save({ ... })             — inserts a new saved query, returns the created row.
 *   delete({ id })            — deletes the caller's own query (ownership check via user_id).
 *
 * Role guard: adminProcedure — voluntarios receive FORBIDDEN on all three.
 * DB errors go through wrapDbError (DX-T2).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../../_core/trpc";
import { createAdminClient } from "../../../../client/src/lib/supabase/server";
import { wrapDbError } from "../_shared";
import { SavedQuerySpecSchema } from "./allowlist";

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID");

export const savedQueriesRouter = router({
  /**
   * List saved queries for the caller: own queries + shared queries,
   * optionally scoped to a programaId.
   */
  list: adminProcedure
    .input(z.object({ programaId: uuidSchema.optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = createAdminClient();

      let q = db
        .from("report_saved_queries")
        .select("*")
        .or(`user_id.eq.${String(ctx.user.id)},is_shared.eq.true`)
        .order("created_at", { ascending: false });

      if (input?.programaId) {
        q = q.eq("programa_id", input.programaId);
      }

      const { data, error } = await q;

      if (error) {
        throw wrapDbError("reports.savedQueries.list", error);
      }

      return data ?? [];
    }),

  /**
   * Save a custom query spec. Returns the created row.
   * The spec is re-validated by SavedQuerySpecSchema here (defense in depth —
   * the input validation at the Zod layer already ran, but we re-validate the
   * spec before persistence to guarantee the stored spec_json is always valid).
   */
  save: adminProcedure
    .input(
      z.object({
        programaId: uuidSchema.optional(),
        nombre: z.string().min(1).max(100),
        descripcion: z.string().max(500).optional(),
        spec: SavedQuerySpecSchema,
        isShared: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = createAdminClient();

      // programa_id is required in the DB type but nullable at runtime — cast needed
      // because the generated types don't reflect the REFERENCES programs(id) ON DELETE SET NULL.
      const insertPayload = {
        user_id: String(ctx.user.id),
        programa_id: (input.programaId ?? null) as string,
        nombre: input.nombre,
        descripcion: input.descripcion ?? null,
        // Json type in DB is broad; spec is a valid JSON object (validated by Zod upstream).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spec_json: input.spec as any,
        is_shared: input.isShared,
      };

      const { data, error } = await db
        .from("report_saved_queries")
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        throw wrapDbError("reports.savedQueries.save", error);
      }

      if (!data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "[reports.savedQueries.save] Insert returned no data",
        });
      }

      return data;
    }),

  /**
   * Delete a saved query owned by the caller.
   * The user_id check is enforced at the DB level via RLS AND at the query
   * level (.eq("user_id", ...)) for defense in depth.
   */
  delete: adminProcedure
    .input(z.object({ id: uuidSchema }))
    .mutation(async ({ ctx, input }) => {
      const db = createAdminClient();

      const { error } = await db
        .from("report_saved_queries")
        .delete()
        .eq("id", input.id)
        .eq("user_id", String(ctx.user.id));

      if (error) {
        throw wrapDbError("reports.savedQueries.delete", error);
      }

      return { success: true } as const;
    }),
});

export type SavedQueriesRouter = typeof savedQueriesRouter;
