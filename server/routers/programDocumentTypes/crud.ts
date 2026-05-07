import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, superadminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import type { Database } from "../../../client/src/lib/database.types";

const uuidLike = z.string().uuid();
const ScopeEnum = z.enum(["familia", "miembro"]);

const TypeInsertSchema = z.object({
  programaId: uuidLike,
  slug: z.string().min(1).max(60).regex(/^[a-z0-9_]+$/, "slug must be lowercase snake_case"),
  nombre: z.string().min(1).max(120),
  descripcion: z.string().max(500).optional(),
  scope: ScopeEnum,
  isRequired: z.boolean().default(false),
  displayOrder: z.number().int().default(0),
});

const TypeUpdateSchema = z.object({
  id: uuidLike,
  nombre: z.string().min(1).max(120).optional(),
  descripcion: z.string().max(500).optional().nullable(),
  isRequired: z.boolean().optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
});

const ListInputSchema = z
  .object({
    programaId: uuidLike.optional(),
    programaSlug: z.string().optional(),
    includeInactive: z.boolean().default(false),
  })
  .refine((d) => !!(d.programaId || d.programaSlug), {
    message: "programaId or programaSlug required",
  });

export const programDocumentTypesCrudRouter = router({
  list: protectedProcedure
    .input(ListInputSchema)
    .query(async ({ input }) => {
      const db = createAdminClient();
      let programaId = input.programaId;
      if (!programaId && input.programaSlug) {
        const { data, error } = await db
          .from("programs")
          .select("id")
          .eq("slug", input.programaSlug)
          .single();
        if (error || !data) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Programa no encontrado" });
        }
        programaId = data.id;
      }
      const query = db
        .from("program_document_types")
        .select("*")
        .eq("programa_id", programaId!);
      const scoped = input.includeInactive ? query : query.eq("is_active", true);
      const { data, error } = await scoped.order("display_order", { ascending: true });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  create: superadminProcedure
    .input(TypeInsertSchema)
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const insert: Database["public"]["Tables"]["program_document_types"]["Insert"] = {
        programa_id: input.programaId,
        slug: input.slug,
        nombre: input.nombre,
        descripcion: input.descripcion ?? null,
        scope: input.scope,
        is_required: input.isRequired,
        display_order: input.displayOrder,
      };
      const { data, error } = await db
        .from("program_document_types")
        .insert(insert)
        .select()
        .single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  update: superadminProcedure
    .input(TypeUpdateSchema)
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { id, ...rest } = input;
      const update: Database["public"]["Tables"]["program_document_types"]["Update"] = {
        updated_at: new Date().toISOString(),
      };
      if (rest.nombre !== undefined) update.nombre = rest.nombre;
      if (rest.descripcion !== undefined) update.descripcion = rest.descripcion;
      if (rest.isRequired !== undefined) update.is_required = rest.isRequired;
      if (rest.isActive !== undefined) update.is_active = rest.isActive;
      if (rest.displayOrder !== undefined) update.display_order = rest.displayOrder;
      const { data, error } = await db
        .from("program_document_types")
        .update(update)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),
});
