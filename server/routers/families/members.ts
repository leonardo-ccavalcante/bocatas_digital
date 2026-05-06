import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { isMemberAdult } from "../../families-doc-helpers";
import {
  uuidLike,
  programIdSchema,
  FamilyMemberSchema,
  resolveMemberPersonId,
  ensureFamiliaEnrollment,
  mirrorMembersToTable,
} from "./_shared";

export const membersRouter = router({
  // ─── Member Management (familia_miembros) ──────────────────────────────────

  /** GET all members for a family */
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

  /** ADD a new member to family — resolves or creates a persons row for adults (≥14),
   *  ensures program_enrollments, and inserts into familia_miembros. */
  addMember: adminProcedure
    .input(
      z.object({
        family_id: uuidLike,
        program_id: programIdSchema,
        member: FamilyMemberSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();

      // Verify the family exists and is not soft-deleted.
      const { data: family, error: fetchErr } = await db
        .from("families")
        .select("id")
        .eq("id", input.family_id)
        .is("deleted_at", null)
        .single();
      if (fetchErr || !family) throw new TRPCError({ code: "NOT_FOUND" });

      // Compute the next positional member_index from familia_miembros count
      // (replaces the legacy JSON-array-length approach).
      const { count: existingCount } = await db
        .from("familia_miembros")
        .select("id", { count: "exact", head: true })
        .eq("familia_id", input.family_id)
        .is("deleted_at", null);
      const nextIndex = (existingCount ?? 0) + 1;

      const personId = await resolveMemberPersonId(db, input.member);

      // Enroll if adult (≥14 or unknown DOB).
      if (isMemberAdult(input.member)) {
        await ensureFamiliaEnrollment(db, personId, input.program_id, input.family_id, nextIndex);
      }

      const newMember = { ...input.member, person_id: personId };

      // Mirror to familia_miembros so families.getById (table-based reads) sees this new member.
      await mirrorMembersToTable(db, ctx, input.family_id, [newMember]);

      return { person_id: personId, member_index: nextIndex };
    }),

  /** UPDATE a family member */
  updateMember: adminProcedure
    .input(
      z.object({
        id: uuidLike,
        nombre: z.string().min(1).max(100).optional(),
        rol: z.enum(["head_of_household", "dependent", "other"]).optional(),
        relacion: z.enum(["parent", "child", "sibling", "other"]).optional(),
        estado: z.enum(["activo", "inactivo"]).optional(),
        fechaNacimiento: z.string().date().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  /** DELETE a family member */
  deleteMember: adminProcedure
    .input(z.object({ id: uuidLike }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { error } = await db.from("familia_miembros").delete().eq("id", input.id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),
});
