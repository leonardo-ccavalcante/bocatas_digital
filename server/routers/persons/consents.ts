import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { adminProcedure, voluntarioProcedure, router } from "../../_core/trpc";
import { uuidLike } from "./_shared";

export const consentsRouter = router({
  /**
   * Get programs list (public data, but proxied through tRPC for consistency).
   * Uses service role key to ensure programs are always visible.
   */
  programs: voluntarioProcedure.query(async () => {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("programs")
      // parent_id / tipo / inscribible: sin ellas el selector del alta recibe una
      // lista plana y pinta los cursos de Formación como hermanos de Comedor
      // (ADR-0013). El endpoint gemelo programs.getAll ya las devolvía.
      .select(
        "id, slug, name, description, icon, is_default, is_active, display_order, parent_id, tipo, inscribible"
      )
      .eq("is_active", true)
      .order("display_order");

    if (error) {
      // Return empty array on error — UI has fallback seed data
      return [];
    }

    return data ?? [];
  }),

  /**
   * Get consent templates for a given language.
   * Uses service role key to ensure templates are always visible.
   */
  consentTemplates: voluntarioProcedure
    .input(z.object({ idioma: z.enum(["es", "ar", "fr", "bm"]).default("es") }))
    .query(async ({ input }) => {
      const supabase = createAdminClient();

      const { data, error } = await supabase
        .from("consent_templates")
        .select("id, purpose, idioma, version, text_content, is_active, updated_at")
        .eq("idioma", input.idioma)
        .eq("is_active", true)
        .order("purpose");

      if (error) return [];
      return data ?? [];
    }),

  /**
   * getPersonConsents — consentimientos YA registrados de una persona.
   *
   * Sin esta lectura el escudo de la ficha no es un visor: es un formulario de
   * captura sobre el catálogo de plantillas, y las casillas salen desmarcadas
   * aunque la persona haya firmado (FAMILIAS-7).
   *
   * adminProcedure, igual que getCheckinHistory: saber qué ha consentido una
   * persona la identifica y describe su relación con la entidad. Los vecinos
   * `consentTemplates` / `programs` son voluntarioProcedure porque devuelven
   * catálogo, no datos de una persona.
   *
   * `documento_foto_url` se queda deliberadamente fuera: es un PATH de Storage
   * a la foto del documento firmado, y devolverlo —crudo o firmado— convierte
   * esta consulta en un enlace replicable a PII (hallazgo CAS-02). La ficha no
   * lo necesita para sembrar las casillas.
   */
  getPersonConsents: adminProcedure
    .input(z.object({ personId: uuidLike }))
    .query(async ({ input }) => {
      const supabase = createAdminClient();

      const { data, error } = await supabase
        .from("consents")
        .select("purpose, granted, granted_at, idioma, consent_version, revoked_at")
        .eq("person_id", input.personId)
        .is("deleted_at", null)
        .order("purpose");

      if (error) {
        // El mensaje del driver puede arrastrar la fila (y con ella datos de la
        // persona) hasta un toast: fuera.
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No se pudieron cargar los consentimientos de esta persona",
        });
      }

      // Proyección explícita: si mañana alguien amplía el select, la respuesta
      // sigue sin filtrar campos nuevos al cliente.
      return (data ?? []).map((row) => ({
        purpose: row.purpose,
        granted: row.granted,
        granted_at: row.granted_at,
        idioma: row.idioma,
        consent_version: row.consent_version,
        revoked_at: row.revoked_at,
      }));
    }),

  /**
   * Save consent records for a person. Uses the service role to bypass RLS —
   * the tRPC guard is the enforcement boundary (ADR-0002).
   *
   * Dos invariantes DISTINTOS, y confundirlos cuesta caro:
   *
   *   · CONSTANCIA — de los tres fines que siempre se preguntan queda registro,
   *     venga en esta petición o ya en base. La ficha manda actualizaciones
   *     PARCIALES (RC-03/F050) y el wizard las manda todas; ambas valen mientras
   *     lo omitido ya conste. Una negativa se prueba con su fila, así que esto
   *     no se relaja (RGPD Art. 5.2).
   *   · CONCESIÓN — sólo `tratamiento_datos_bocatas` tiene que acabar concedido.
   *     Exigir además la cesión de imagen o el WhatsApp convertía el
   *     consentimiento en condición para recibir el servicio, que es lo que el
   *     Art. 7(4) no admite, y dejaba fuera a quien no quisiera salir en una
   *     foto (ALTAS-8).
   */
  saveConsents: voluntarioProcedure
    .input(z.object({
      personId: z.string().uuid(),
      consents: z.array(z.object({
        purpose: z.enum(["tratamiento_datos_bocatas", "tratamiento_datos_banco_alimentos", "compartir_datos_red", "comunicaciones_whatsapp", "fotografia"]),
        idioma: z.enum(["es", "ar", "fr", "bm"]),
        granted: z.boolean(),
        granted_at: z.string(),
        consent_text: z.string().optional(),
        consent_version: z.string().optional(),
        // Storage PATH, not a URL — see persons/photo.ts.
        documento_foto_url: z.string().max(255).optional().nullable(),
        numero_serie: z.string().max(50).optional().nullable(),
        registrado_por: z.string().uuid().optional().nullable(),
      })),
    }))
    .mutation(async ({ input }) => {
      if (input.consents.length === 0) return [];

      const supabase = createAdminClient();
      await assertGroupACovered(supabase, input.personId, input.consents);

      const rows = input.consents.map((c) => ({
        person_id: input.personId,
        purpose: c.purpose,
        idioma: c.idioma,
        granted: c.granted,
        granted_at: c.granted_at,
        consent_text: c.consent_text ?? "",
        consent_version: c.consent_version ?? "",
        documento_foto_url: c.documento_foto_url ?? null,
        numero_serie: c.numero_serie ?? null,
        registrado_por: c.registrado_por ?? null,
      }));

      const { data, error } = await supabase
        .from("consents")
        .upsert(rows, { onConflict: "person_id,purpose" })
        .select("id, purpose, granted");

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al guardar consentimientos: ${error.message}`,
        });
      }

      return data ?? [];
    }),
});

/** Los tres fines de los que SIEMPRE tiene que quedar constancia. */
const SIEMPRE_RECOGIDOS = ["tratamiento_datos_bocatas", "fotografia", "comunicaciones_whatsapp"] as const;

/** El único que además tiene que estar CONCEDIDO para poder registrar. */
const OBLIGATORIOS = ["tratamiento_datos_bocatas"] as const;

async function assertGroupACovered(
  supabase: ReturnType<typeof createAdminClient>,
  personId: string,
  consents: Array<{ purpose: string; granted: boolean }>,
): Promise<void> {
  const submitted = new Map(consents.map((c) => [c.purpose, c.granted]));

  const denegados = OBLIGATORIOS.filter((p) => submitted.get(p) === false);
  if (denegados.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Sin el consentimiento de tratamiento de datos no se puede completar el registro.",
    });
  }

  const ausentes = SIEMPRE_RECOGIDOS.filter((p) => !submitted.has(p));
  if (ausentes.length === 0) return;

  // Lo omitido tiene que constar ya en base. Ojo al matiz: para la imagen y el
  // WhatsApp basta que EXISTA la fila —un "no" registrado es una decisión
  // documentada, no un hueco—, mientras que el tratamiento de datos tiene que
  // constar CONCEDIDO. Filtrar aquí por granted=true para los tres dejaría a la
  // ficha sin poder guardar nada de quien denegó la foto en el alta.
  const { data, error } = await supabase
    .from("consents")
    .select("purpose, granted")
    .eq("person_id", personId)
    .in("purpose", ausentes);
  if (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Error al comprobar los consentimientos existentes",
    });
  }

  const filas = new Map((data ?? []).map((r) => [r.purpose as string, r.granted as boolean]));
  const sinConstancia = ausentes.filter((p) => !filas.has(p));
  if (sinConstancia.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Faltan consentimientos obligatorios del Grupo A: ${sinConstancia.join(", ")}`,
    });
  }

  const sinConceder = OBLIGATORIOS.filter((p) => ausentes.includes(p) && filas.get(p) !== true);
  if (sinConceder.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Sin el consentimiento de tratamiento de datos no se puede completar el registro.",
    });
  }
}
