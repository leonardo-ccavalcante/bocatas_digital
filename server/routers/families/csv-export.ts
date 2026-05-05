import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { generateFamiliesCSVWithMembers } from "../../csvExportWithMembers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildFamiliesWithMembers(families: any[], members: any[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (families ?? []).map((f: any) => ({
    family: {
      id: f.id,
      familia_numero: f.familia_numero?.toString() ?? "",
      nombre_familia: f.persons?.nombre ?? "",
      contacto_principal: f.persona_recoge ?? "",
      telefono: f.persons?.telefono ?? "",
      direccion: "",
      estado: f.estado ?? "activo",
      fecha_creacion: f.created_at?.split("T")[0] ?? "",
      miembros_count: (f.num_adultos ?? 0) + (f.num_menores_18 ?? 0),
      docs_identidad: false,
      padron_recibido: false,
      justificante_recibido: false,
      consent_bocatas: false,
      consent_banco_alimentos: false,
      informe_social: f.informe_social ?? false,
      informe_social_fecha: f.informe_social_fecha ?? null,
      alta_en_guf: f.alta_en_guf ?? false,
      fecha_alta_guf: f.fecha_alta_guf ?? null,
      guf_verified_at: f.guf_verified_at ?? null,
    },
    members: (members ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((m: any) => m.familia_id === f.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((m: any) => ({
        id: m.id,
        familia_id: m.familia_id,
        nombre: m.nombre,
        rol: m.rol,
        relacion: m.relacion,
        fecha_nacimiento: m.fecha_nacimiento,
        estado: m.estado,
      })),
  }));
}

export const csvExportRouter = router({
  // ─── Job 10: CSV Export ────────────────────────────────────────────────
  /** GET CSV export of families data */
  exportFamilies: adminProcedure
    .input(z.object({ mode: z.enum(["update", "audit", "verify"]) }))
    .query(async ({ input }) => {
      const db = createAdminClient();

      const { data: families, error } = await db
        .from("families")
        .select(
          `id, familia_numero, estado, num_adultos, num_menores_18,
           persona_recoge, autorizado, alta_en_guf, fecha_alta_guf,
           informe_social, informe_social_fecha, guf_verified_at,
           created_at, deleted_at,
           persons!titular_id(nombre, apellidos, telefono)`
        )
        .is("deleted_at", null)
        .order("familia_numero", { ascending: true });

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      const { data: members, error: membersError } = await db
        .from("familia_miembros")
        .select("id, familia_id, nombre, rol, relacion, fecha_nacimiento, estado")
        .is("deleted_at", null);

      if (membersError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: membersError.message });

      const familiesWithMembers = buildFamiliesWithMembers(families ?? [], members ?? []);
      const csv = generateFamiliesCSVWithMembers(familiesWithMembers, input.mode);
      return {
        csv,
        recordCount: familiesWithMembers.length,
        memberCount: members?.length ?? 0,
        mode: input.mode,
      };
    }),

  // ─── Job 11: CSV Export with Members (NEW) ──────────────────────────────
  /** GET export families + members with UUIDs */
  exportFamiliesWithMembers: adminProcedure
    .input(z.object({ mode: z.enum(["update", "audit", "verify"]) }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();

      const { data: families, error: familiesError } = await db
        .from("families")
        .select(
          `id, familia_numero, estado, num_adultos, num_menores_18,
           persona_recoge, autorizado, alta_en_guf, fecha_alta_guf,
           informe_social, informe_social_fecha, guf_verified_at,
           created_at, deleted_at,
           persons!titular_id(nombre, apellidos, telefono)`
        )
        .is("deleted_at", null)
        .order("familia_numero", { ascending: true });

      if (familiesError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: familiesError.message });

      const { data: members, error: membersError } = await db
        .from("familia_miembros")
        .select("id, familia_id, nombre, rol, relacion, fecha_nacimiento, estado")
        .is("deleted_at", null);

      if (membersError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: membersError.message });

      const familiesWithMembers = buildFamiliesWithMembers(families ?? [], members ?? []);
      const csv = generateFamiliesCSVWithMembers(familiesWithMembers, input.mode);
      return {
        csv,
        recordCount: familiesWithMembers.length,
        memberCount: members?.length ?? 0,
        mode: input.mode,
      };
    }),
});
