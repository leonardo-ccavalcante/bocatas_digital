import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { protectedProcedure, router } from "../../_core/trpc";
import { FaseItinerarioEnum } from "./_shared";

export const adminRouter = router({
  /**
   * Update a person's role (admin/superadmin only).
   * Validates role against allowed enum values.
   */
  updateRole: protectedProcedure
    .input(
      z.object({
        personId: z.string().uuid("Invalid person ID"),
        newRole: z.enum(["user", "admin", "superadmin", "voluntario", "beneficiario"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Only admin/superadmin can change roles
      if (ctx.user.role !== "admin" && ctx.user.role !== "superadmin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Solo admin puede cambiar roles" });
      }

      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("persons")
        .update({ role: input.newRole })
        .eq("id", input.personId)
        .select("id, role")
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Persona no encontrada" });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al actualizar rol: ${error.message}`,
        });
      }

      return { success: true, newRole: data.role };
    }),

  /**
   * Update a person's fase itinerario (itinerary phase).
   * Only admin/superadmin can change this field.
   * Uses service role key to bypass RLS.
   */
  updateFaseItinerario: protectedProcedure
    .input(
      z.object({
        personId: z.string().uuid("Invalid person ID"),
        newFaseItinerario: FaseItinerarioEnum,
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Only admin/superadmin can change fase itinerario
      if (ctx.user.role !== "admin" && ctx.user.role !== "superadmin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Solo admin puede cambiar fase itinerario" });
      }

      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("persons")
        .update({ fase_itinerario: input.newFaseItinerario })
        .eq("id", input.personId)
        .select("id, fase_itinerario")
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Persona no encontrada" });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al actualizar fase itinerario: ${error.message}`,
        });
      }

      return { success: true, newFaseItinerario: data.fase_itinerario };
    }),
});
