import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { uuidLike, type Entrega } from "./_shared";

export const crudRouter = router({
  /**
   * Get deliveries from the canonical `deliveries` table.
   */
  getDeliveries: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().positive().default(50),
        offset: z.number().int().nonnegative().default(0),
        familiaId: uuidLike.optional(),
        fechaFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        fechaTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const db = createAdminClient();
        let query = db
          .from("deliveries")
          .select("*", { count: "exact" })
          .is("deleted_at", null);
        if (input.familiaId) {
          query = query.eq("family_id", input.familiaId);
        }
        if (input.fechaFrom) {
          query = query.gte("fecha_entrega", input.fechaFrom);
        }
        if (input.fechaTo) {
          query = query.lte("fecha_entrega", input.fechaTo);
        }
        query = query
          .order("fecha_entrega", { ascending: false })
          .range(input.offset, input.offset + input.limit - 1);
        const { data, error, count } = await query;
        if (error) {
          console.error("Error fetching deliveries:", error);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error al obtener entregas" });
        }
        return {
          success: true,
          data: (data as Entrega[]) || [],
          total: count || 0,
          message: `${(data as Entrega[])?.length || 0} entregas encontradas`,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Error desconocido" });
      }
    }),

  /**
   * Get single delivery by ID from the canonical `deliveries` table.
   */
  getDeliveryById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const db = createAdminClient();
        const { data, error } = await db
          .from("deliveries")
          .select("*")
          .eq("id", input.id)
          .is("deleted_at", null)
          .single();
        if (error) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Entrega no encontrada" });
        }
        return {
          success: true,
          data: data as Entrega,
          message: "Entrega obtenida exitosamente",
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Error desconocido" });
      }
    }),

  /**
   * Create a delivery record in the canonical `deliveries` table.
   */
  createDelivery: protectedProcedure
    .input(
      z.object({
        family_id: uuidLike,
        fecha_entrega: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        recogido_por: z.string().optional(),
        es_autorizado: z.boolean().optional(),
        kg_frutas_hortalizas: z.number().nonnegative().optional(),
        kg_carne: z.number().nonnegative().optional(),
        kg_infantil: z.number().nonnegative().optional(),
        kg_otros: z.number().nonnegative().optional(),
        notas: z.string().optional(),
        session_id: uuidLike.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const db = createAdminClient();
        const { data, error } = await db
          .from("deliveries")
          .insert([{
            family_id: input.family_id,
            fecha_entrega: input.fecha_entrega,
            recogido_por: input.recogido_por ?? null,
            es_autorizado: input.es_autorizado ?? false,
            kg_frutas_hortalizas: input.kg_frutas_hortalizas ?? null,
            kg_carne: input.kg_carne ?? null,
            kg_infantil: input.kg_infantil ?? null,
            kg_otros: input.kg_otros ?? null,
            notas: input.notas ?? null,
            session_id: input.session_id ?? null,
            registrado_por: ctx.user?.name ?? null,
          }])
          .select()
          .single();
        if (error) {
          console.error("Error creating delivery:", error);
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message || "Error al crear entrega" });
        }
        return {
          success: true,
          data: data as Entrega,
          message: "Entrega creada exitosamente",
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Error desconocido" });
      }
    }),

  /**
   * Update a delivery record in the canonical `deliveries` table.
   */
  updateDelivery: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        updates: z.object({
          recogido_por: z.string().optional(),
          es_autorizado: z.boolean().optional(),
          kg_frutas_hortalizas: z.number().nonnegative().optional(),
          kg_carne: z.number().nonnegative().optional(),
          kg_infantil: z.number().nonnegative().optional(),
          kg_otros: z.number().nonnegative().optional(),
          notas: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const db = createAdminClient();
        const { data, error } = await db
          .from("deliveries")
          .update({ ...input.updates, updated_at: new Date().toISOString() })
          .eq("id", input.id)
          .is("deleted_at", null)
          .select()
          .single();
        if (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message || "Error al actualizar entrega" });
        }
        return { success: true, data: data as Entrega, message: "Entrega actualizada exitosamente" };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Error desconocido" });
      }
    }),

  /**
   * Soft-delete a delivery record in the canonical `deliveries` table.
   */
  deleteDelivery: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      try {
        const db = createAdminClient();
        const { error } = await db
          .from("deliveries")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", input.id);
        if (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message || "Error al eliminar entrega" });
        }
        return { success: true, message: "Entrega eliminada exitosamente" };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Error desconocido" });
      }
    }),
});
