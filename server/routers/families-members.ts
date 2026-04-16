import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../_core/trpc";
import { createAdminClient } from "../../client/src/lib/supabase/server";

const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID format");

// ─── Input Schemas ─────────────────────────────────────────────────────────

const AddMemberSchema = z.object({
  familiaId: uuidLike,
  nombre: z.string().min(1).max(100),
  rol: z.enum(["head_of_household", "dependent", "other"]),
  relacion: z.enum(["parent", "child", "sibling", "other"]).optional(),
  estado: z.enum(["activo", "inactivo"]).default("activo"),
  fechaNacimiento: z.string().date().optional(),
});

const UpdateMemberSchema = z.object({
  id: uuidLike,
  nombre: z.string().min(1).max(100).optional(),
  rol: z.enum(["head_of_household", "dependent", "other"]).optional(),
  relacion: z.enum(["parent", "child", "sibling", "other"]).optional(),
  estado: z.enum(["activo", "inactivo"]).optional(),
  fechaNacimiento: z.string().date().optional(),
});

// ─── Member Management Router ──────────────────────────────────────────────

export const familiesMembersRouter = router({
  // ─── GET all members for a family ──────────────────────────────────────
  getMembers: adminProcedure
    .input(z.object({ familiaId: uuidLike }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("familia_miembros")
        .select("*")
        .eq("familia_id", input.familiaId)
        .order("created_at", { ascending: true });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  // ─── ADD a new member to family ────────────────────────────────────────
  addMember: adminProcedure
    .input(AddMemberSchema)
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("familia_miembros")
        .insert({
          familia_id: input.familiaId,
          nombre: input.nombre,
          rol: input.rol,
          relacion: input.relacion ?? null,
          estado: input.estado,
          fecha_nacimiento: input.fechaNacimiento ?? null,
        })
        .select()
        .single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  // ─── UPDATE a family member ────────────────────────────────────────────
  updateMember: adminProcedure
    .input(UpdateMemberSchema)
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const updateData: any = {};
      if (input.nombre !== undefined) updateData.nombre = input.nombre;
      if (input.rol !== undefined) updateData.rol = input.rol;
      if (input.relacion !== undefined) updateData.relacion = input.relacion;
      if (input.estado !== undefined) updateData.estado = input.estado;
      if (input.fechaNacimiento !== undefined) updateData.fecha_nacimiento = input.fechaNacimiento;
      updateData.updated_at = new Date().toISOString();

      const { data, error } = await db
        .from("familia_miembros")
        .update(updateData)
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  // ─── DELETE a family member ────────────────────────────────────────────
  deleteMember: adminProcedure
    .input(z.object({ id: uuidLike }))
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { error } = await db.from("familia_miembros").delete().eq("id", input.id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),
});
