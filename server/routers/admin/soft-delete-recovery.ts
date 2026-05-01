import { protectedProcedure, router } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { restoreWithCascade } from "../../db/soft-delete-cascade";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

export const softDeleteRecoveryRouter = router({
  listDeletedFamilies: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        search: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      let query = db
        .from("families")
        .select("id, familia_numero, estado, deleted_at, updated_at", {
          count: "exact",
        })
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      if (input.search) {
        query = query.or(
          `familia_numero.ilike.%${input.search}%,estado.ilike.%${input.search}%`
        );
      }

      const { data, count, error } = await query.range(
        input.offset,
        input.offset + input.limit - 1
      );

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return {
        items: data || [],
        total: count || 0,
        limit: input.limit,
        offset: input.offset,
      };
    }),

  getDeletedFamilyDetails: adminProcedure
    .input(z.object({ familyId: z.string().uuid() }))
    .query(async ({ input }) => {
      const db = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Get family
      const { data: family, error: familyError } = await db
        .from("families")
        .select("*")
        .eq("id", input.familyId)
        .single();

      if (familyError || !family) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Family not found",
        });
      }

      // Get deleted members
      const { data: deletedMembers } = await db
        .from("familia_miembros")
        .select("id, nombre, rol, deleted_at")
        .eq("familia_id", input.familyId)
        .not("deleted_at", "is", null);

      // Get deleted deliveries
      const { data: deletedDeliveries } = await db
        .from("entregas")
        .select("id, fecha, estado, deleted_at")
        .eq("familia_id", input.familyId)
        .not("deleted_at", "is", null);

      return {
        family,
        deletedMembers: deletedMembers || [],
        deletedDeliveries: deletedDeliveries || [],
        totalDeleted:
          (deletedMembers?.length || 0) + (deletedDeliveries?.length || 0),
      };
    }),

  restoreFamily: adminProcedure
    .input(z.object({ familyId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const db = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      try {
        // Restore family and cascade
        await restoreWithCascade(db, "families", input.familyId);

        // Count restored records
        const { data: family } = await db
          .from("families")
          .select("id")
          .eq("id", input.familyId)
          .single();

        const { data: members } = await db
          .from("familia_miembros")
          .select("id")
          .eq("familia_id", input.familyId);

        return {
          success: true,
          familyId: input.familyId,
          restoredCount: 1 + (members?.length || 0),
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to restore family: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  listDeletedPersons: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data, count, error } = await db
        .from("persons")
        .select("id, nombre, deleted_at, updated_at", {
          count: "exact",
        })
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return {
        items: data || [],
        total: count || 0,
      };
    }),

  restorePerson: adminProcedure
    .input(z.object({ personId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const db = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      try {
        await restoreWithCascade(db, "persons", input.personId);

        return {
          success: true,
          personId: input.personId,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to restore person: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),
});
