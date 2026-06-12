import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { adminProcedure, protectedProcedure, voluntarioProcedure, router } from "../../_core/trpc";
import { logProcedureAction, logProcedureError } from "../../_core/logging-middleware";
import { redactHighRiskFields } from "../../_core/rlsRedaction";
import { ilikeForOr } from "../../_core/postgrestFilter";
import { PersonCreateInput } from "./_shared";

const ELEVATED_ROLES = new Set(["admin", "superadmin"]);

/**
 * `notas_privadas` (social-worker notes) is restricted — it is excluded from
 * the `persons_safe` view and must not reach non-elevated callers. It is not
 * in HIGH_RISK_FIELDS pending EIPD classification (see docs/TECH_DEBT.md S-05),
 * so getById gates it explicitly alongside redactHighRiskFields.
 */
const PERSONS_RESTRICTED_EXTRA_FIELDS = ["notas_privadas"] as const;

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

export function getPersonValidationWarnings(
  personData: Pick<
    z.infer<typeof PersonCreateInput>,
    "tipo_documento" | "pais_documento"
  >
): string[] {
  const validationWarnings: string[] = [];

  if (
    personData.tipo_documento === "Documento_Extranjero" &&
    !personData.pais_documento
  ) {
    validationWarnings.push(
      "pais_documento required for Documento_Extranjero"
    );
  }

  return validationWarnings;
}

export const crudRouter = router({
  /**
   * Create a new person record.
   * Uses service role key to bypass RLS (Manus OAuth users have no Supabase JWT).
   */
  create: voluntarioProcedure
    .input(PersonCreateInput)
    .mutation(async ({ ctx, input }) => {
      const supabase = createAdminClient();
      const { program_ids, ...personData } = input;
      void program_ids;
      const startTime = Date.now();

      const validationWarnings = getPersonValidationWarnings(personData);

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
        // codigo_postal drives persons.distrito automatically via the
        // trg_persons_set_distrito trigger (M2); we never set distrito directly.
        codigo_postal: str(personData.codigo_postal),
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
          validationWarnings,
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
        duration,
        validationWarnings,
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
  getById: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
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
        // C-05: never echo the raw Supabase message (can contain PII / schema
        // internals) to the client. Log it server-side; return a generic message.
        logProcedureError(ctx, "persons.getById failed", error, { personId: input.id });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No se pudo obtener la persona. Inténtalo de nuevo.",
        });
      }

      // C-01: getById uses the service-role client (bypasses RLS) and returns
      // the full profile. High-risk PII is admin/superadmin-only (CLAUDE.md §3),
      // so redact at the boundary for non-elevated callers — mirrors
      // families.getById.
      const redacted = redactHighRiskFields(ctx.user.role, data);
      if (redacted && !ELEVATED_ROLES.has(ctx.user.role)) {
        const row = redacted as Record<string, unknown>;
        for (const field of PERSONS_RESTRICTED_EXTRA_FIELDS) {
          delete row[field];
        }
      }
      return redacted;
    }),

  /**
   * Get all persons (admin view).
   * Uses service role key to bypass RLS — the role gate is enforced at
   * the tRPC layer so the admin column list only ships to admin/superadmin
   * callers.
   */
  getAll: adminProcedure.query(async ({ ctx }) => {
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
        .or(`nombre.ilike.${ilikeForOr(trimmed)},apellidos.ilike.${ilikeForOr(trimmed)}`)
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
