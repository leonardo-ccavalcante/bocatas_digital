import { TRPCError } from "@trpc/server";
import { signPathField, AVATAR_BUCKET } from "../../storage";
import { z } from "zod";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { adminProcedure, voluntarioProcedure, router } from "../../_core/trpc";
import { logProcedureAction, logProcedureError } from "../../_core/logging-middleware";
import { redactHighRiskFields } from "../../_core/rlsRedaction";
import { encryptPII, decryptPII, isPiiCryptoConfigured } from "../../_core/pii-crypto";
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

/**
 * MYT-80-ATL03 (P1, gh #80) — `persons.getAll` had no `.limit()`/`.range()`
 * and dragged every non-deleted row (707+ and growing) on every call.
 * Optional, backward-compatible input: a caller with no args still gets a
 * bounded default page (never "everything"); `limit` is hard-capped so a
 * caller cannot opt back into a truly unbounded fetch.
 *
 * Review follow-up (same issue): `Personas.tsx` (admin directory: filter
 * pills, estado/fase counts, search) and `PersonsTable.tsx` (role/fase
 * management) are both designed to operate client-side over the FULL person
 * set — they are not paginated UIs. A default-50 cap with no caller override
 * silently truncated the admin directory to the first 50 people and broke
 * role management past #50. The cap is sized to today's real directory
 * (707+) instead of an arbitrary small number, and both call sites now pass
 * an explicit `limit` (`client/src/features/persons/constants.ts`,
 * `PERSONS_DIRECTORY_FULL_LIMIT`) to request the full set. When the person
 * count needs to grow past this cap, that's the signal to build the real
 * pager UI (gh #80 follow-up) — not to raise the cap again.
 */
export const PERSONS_GETALL_DEFAULT_LIMIT = 50;
export const PERSONS_GETALL_MAX_LIMIT = 1000;

export const PersonsGetAllInput = z
  .object({
    limit: z.number().int().min(1).max(PERSONS_GETALL_MAX_LIMIT).default(PERSONS_GETALL_DEFAULT_LIMIT),
    offset: z.number().int().min(0).default(0),
  })
  .optional();

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

// ── findDuplicatesHandler ────────────────────────────────────────────────────
// Exported for unit testing (see server/routers/__tests__/persons.findDuplicates.test.ts).
// Called by the findDuplicates tRPC procedure below.
//
// Why this exists: find_duplicate_persons has EXECUTE revoked from PUBLIC and
// authenticated (migration 20260506000007). The frontend anon key inherits from
// PUBLIC → 401. service_role (createAdminClient) retains EXECUTE.
export async function findDuplicatesHandler(input: {
  nombre: string;
  apellidos: string;
  threshold: number;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("find_duplicate_persons", {
    p_nombre: input.nombre,
    p_apellidos: input.apellidos,
    p_threshold: input.threshold,
  });
  if (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Error al buscar duplicados: ${error.message}`,
    });
  }
  return (data ?? []) as Array<{
    id: string;
    nombre: string;
    apellidos: string;
    fecha_nacimiento: string | null;
    foto_perfil_url: string | null;
    similarity: number;
  }>;
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
      const { program_ids, colectivo_consentimiento, ...personData } = input;
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
        situacion_ante_empleo: personData.situacion_ante_empleo ?? null,
        nivel_ingresos: personData.nivel_ingresos ?? null,
        // RGPD Art. 9/10 special-category — persisted ONLY under explicit
        // consent. The enum tags are stored plainly (needed for aggregation);
        // the free-text "otros" is app-layer encrypted at rest, and is stored
        // ONLY when the encryption key is configured — otherwise it is dropped
        // (never stored as plaintext) so a missing key degrades gracefully
        // instead of failing the whole registration.
        colectivos: colectivo_consentimiento ? (personData.colectivos ?? null) : null,
        colectivo_otros: colectivo_consentimiento && isPiiCryptoConfigured()
          ? encryptPII(str(personData.colectivo_otros))
          : null,
        canal_llegada: personData.canal_llegada,
        entidad_derivadora: str(personData.entidad_derivadora),
        persona_referencia: str(personData.persona_referencia),
        motivo_retorno: str(personData.motivo_retorno),
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
      } else if (redacted && ELEVATED_ROLES.has(ctx.user.role)) {
        // Elevated callers keep colectivo_otros; decrypt for display. Degrade
        // to null on failure (e.g. key rotated away) rather than failing the
        // whole profile read.
        const row = redacted as Record<string, unknown>;
        if (typeof row.colectivo_otros === "string") {
          try {
            row.colectivo_otros = decryptPII(row.colectivo_otros as string);
          } catch {
            row.colectivo_otros = null;
          }
        }
      }
      if (redacted) {
        await signPathField(AVATAR_BUCKET, [redacted], "foto_perfil_url");
        // La foto del documento NO viaja en la ficha, y esto no es cosmética.
        //
        // Antes se firmaba aquí para todo rol elevado: CADA carga de ficha
        // devolvía en el JSON una URL firmada y válida diez minutos al DNI de
        // esa persona, renderizara la UI lo que renderizara. Un admin con las
        // herramientas del navegador, un proxy, o una mirada a la caché de
        // React Query la tenía igual. Esconder el botón no restringe nada.
        //
        // Ahora se acuña bajo demanda, sólo para superadministración y con
        // registro de auditoría, en persons.getDocumentUrls. Si esta línea
        // volviera, cada apertura de ficha sería una lectura sin rastro y la
        // auditoría de allí sería mentira.
        delete (redacted as Record<string, unknown>).foto_documento_url;
      }
      return redacted;
    }),

  /**
   * Get all persons (admin view), server-side paginated (MYT-80-ATL03).
   * Uses service role key to bypass RLS — the role gate is enforced at
   * the tRPC layer so the admin column list only ships to admin/superadmin
   * callers. `input` is optional for backward compatibility: an omitted
   * input still applies the bounded default page, it never falls back to
   * an unbounded fetch.
   */
  getAll: adminProcedure.input(PersonsGetAllInput).query(async ({ ctx, input }) => {
    const supabase = createAdminClient();
    const limit = input?.limit ?? PERSONS_GETALL_DEFAULT_LIMIT;
    const offset = input?.offset ?? 0;

    const { data, error, count } = await supabase
      .from("persons")
      .select(getAllColumnsForRole(ctx.user.role), { count: "exact" })
      .is("deleted_at", null)
      .order("nombre")
      .range(offset, offset + limit - 1);

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Error al obtener personas: ${error.message}`,
      });
    }

    // One batched Storage call for the page — never per row: this feeds the
    // "Sin QR" manual search, which has a < 2s budget on low-end Android.
    const rows = data ?? [];
    await signPathField(AVATAR_BUCKET, rows, "foto_perfil_url");
    return { data: rows, total: count ?? 0 };
  }),

  /**
   * Find duplicate persons using pg_trgm similarity (server-side).
   * See findDuplicatesHandler above for the rationale.
   */
  findDuplicates: voluntarioProcedure
    .input(
      z.object({
        nombre: z.string().min(1).max(200),
        apellidos: z.string().max(200).default(""),
        threshold: z.number().min(0).max(1).default(0.7),
      })
    )
    .query(async ({ input }) => {
      return findDuplicatesHandler(input);
    }),
});
