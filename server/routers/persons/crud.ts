import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { protectedProcedure, router } from "../../_core/trpc";
import { logProcedureAction, logProcedureError } from "../../_core/logging-middleware";
import { PersonCreateInput } from "./_shared";

/**
 * Phase 6 QA-1C — RLS-equivalent column-list gate for `persons.getAll`.
 *
 * Manus OAuth users have no Supabase JWT, so RLS policies see them as
 * anon and we use `createAdminClient()` (service role). To preserve the
 * RLS guarantee from CLAUDE.md §3 — high-risk fields (`situacion_legal`,
 * `foto_documento_url`, `recorrido_migratorio`) restricted to
 * admin/superadmin — we pick the SELECT column list at the tRPC layer
 * based on the caller's role.
 *
 * Exported separately so the gate is unit-testable without a Supabase
 * mock. The other high-risk fields aren't used in `getAll` today; if
 * added later, this is the single place to extend.
 */
export const PERSONS_GETALL_BASE_COLUMNS =
  "id, nombre, apellidos, fecha_nacimiento, foto_perfil_url, fase_itinerario, created_at, tipo_documento, numero_documento, fecha_llegada_espana, role";

export const PERSONS_GETALL_ADMIN_COLUMNS =
  PERSONS_GETALL_BASE_COLUMNS + ", situacion_legal";

export function getAllColumnsForRole(role: string | undefined | null): string {
  return role === "admin" || role === "superadmin"
    ? PERSONS_GETALL_ADMIN_COLUMNS
    : PERSONS_GETALL_BASE_COLUMNS;
}

export const crudRouter = router({
  /**
   * Create a new person record.
   * Uses service role key to bypass RLS (Manus OAuth users have no Supabase JWT).
   */
  create: protectedProcedure
    .input(PersonCreateInput)
    .mutation(async ({ ctx, input }) => {
      const supabase = createAdminClient();
      const { program_ids: _, ...personData } = input;
      const startTime = Date.now();

      // Validation warnings
      const validationWarnings: string[] = [];

      // Validate pais_documento requirement for Documento_Extranjero
      if (
        personData.tipo_documento === "Documento_Extranjero" &&
        !personData.pais_documento
      ) {
        validationWarnings.push(
          "pais_documento required for Documento_Extranjero"
        );
      }

      // Helper: convert empty strings to null to satisfy DB CHECK constraints
      const str = (v: string | null | undefined): string | null =>
        v === "" || v === undefined ? null : v;

      const insertPayload = {
        nombre: personData.nombre,
        apellidos: personData.apellidos,
        fecha_nacimiento: personData.fecha_nacimiento,
        genero: personData.genero ?? null,
        pais_origen: str(personData.pais_origen),
        idioma_principal: personData.idioma_principal,
        idiomas: personData.idiomas ?? null,
        telefono: str(personData.telefono),
        email: str(personData.email),
        direccion: str(personData.direccion),
        municipio: str(personData.municipio),
        barrio_zona: str(personData.barrio_zona),
        tipo_documento: personData.tipo_documento ?? null,
        numero_documento: str(personData.numero_documento),
        pais_documento: str(personData.pais_documento),
        situacion_legal: personData.situacion_legal ?? null,
        fecha_llegada_espana: str(personData.fecha_llegada_espana),
        tipo_vivienda: personData.tipo_vivienda ?? null,
        estabilidad_habitacional: personData.estabilidad_habitacional ?? null,
        empadronado: personData.empadronado ?? null,
        nivel_estudios: personData.nivel_estudios ?? null,
        situacion_laboral: personData.situacion_laboral ?? null,
        nivel_ingresos: personData.nivel_ingresos ?? null,
        canal_llegada: personData.canal_llegada,
        entidad_derivadora: str(personData.entidad_derivadora),
        persona_referencia: str(personData.persona_referencia),
        recorrido_migratorio: str(personData.recorrido_migratorio),
        necesidades_principales: str(personData.necesidades_principales),
        restricciones_alimentarias: str(personData.restricciones_alimentarias),
        observaciones: str(personData.observaciones),
        notas_privadas: str(personData.notas_privadas),
        fase_itinerario: personData.fase_itinerario ?? undefined,
        foto_perfil_url: str(personData.foto_perfil_url),
        foto_documento_url: str(personData.foto_documento_url),
      };

      const { data: person, error } = await supabase
        .from("persons")
        .insert([insertPayload])
        .select("id, nombre, apellidos")
        .single();

      if (error) {
        logProcedureError(ctx, 'Failed to create person', error as Error, {
          nombre: personData.nombre,
          apellidos: personData.apellidos,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al crear persona: ${error.message}`,
          cause: error,
        });
      }

      const duration = Date.now() - startTime;
      logProcedureAction(ctx, 'Person created successfully', {
        personId: person.id,
        nombre: person.nombre,
        apellidos: person.apellidos,
        duration,
      });

      return {
        ...person,
        validation_warnings: validationWarnings,
      };
    }),

  /**
   * Get a single person by ID.
   * Uses service role key to bypass RLS.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const supabase = createAdminClient();

      const { data, error } = await supabase
        .from("persons")
        .select("*")
        .eq("id", input.id)
        .is("deleted_at", null)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Persona no encontrada" });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al obtener persona: ${error.message}`,
        });
      }

      return data;
    }),

  /**
   * Get all persons (admin view).
   * Uses service role key to bypass RLS — the role gate is enforced at
   * the tRPC layer via getAllColumnsForRole(ctx.user.role) so high-risk
   * fields (e.g. situacion_legal) only ship to admin/superadmin callers.
   */
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("persons")
      .select(getAllColumnsForRole(ctx.user.role))
      .is("deleted_at", null)
      .order("nombre");

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Error al obtener personas: ${error.message}`,
      });
    }

    return data ?? [];
  }),

  /**
   * Search persons by name.
   * Uses service role key to bypass RLS.
   */
  search: protectedProcedure
    .input(z.object({ query: z.string().min(2).max(100) }))
    .query(async ({ input }) => {
      const supabase = createAdminClient();
      const trimmed = input.query.trim();

      const { data, error } = await supabase
        .from("persons")
        .select("id, nombre, apellidos, fecha_nacimiento, foto_perfil_url, restricciones_alimentarias, fase_itinerario")
        .or(`nombre.ilike.%${trimmed}%,apellidos.ilike.%${trimmed}%`)
        .is("deleted_at", null)
        .order("nombre")
        .limit(20);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error en búsqueda: ${error.message}`,
        });
      }

      return data ?? [];
    }),
});
