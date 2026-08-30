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
      // Antes devolvía [] y el cliente lo rellenaba con un catálogo de reserva
      // inventado, así que un fallo de base se veía como seis programas
      // plausibles con UUIDs que no existen. Un error tiene que verse: sin
      // catálogo no se puede inscribir a nadie, y fingir lo contrario es peor.
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "No se pudo cargar el catálogo de programas",
      });
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
   * Save consent records for a person.
   * Uses service role key to bypass RLS.
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

      // Dos comprobaciones distintas, y confundirlas cuesta caro (ALTAS-8).
      //
      // COMPLETITUD: los tres fines vienen SIEMPRE en la petición. Una negativa
      // se prueba con su fila `granted=false`; si el cliente pudiera omitir
      // `fotografia`, la negativa dejaría de constar y se perdería la prueba que
      // exige el principio de responsabilidad proactiva (RGPD Art. 5.2).
      const SIEMPRE_RECOGIDOS = [
        "tratamiento_datos_bocatas",
        "fotografia",
        "comunicaciones_whatsapp",
      ] as const;
      const submittedMap = new Map(input.consents.map((c) => [c.purpose, c.granted]));
      const missing = SIEMPRE_RECOGIDOS.filter((p) => !submittedMap.has(p));
      if (missing.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Faltan consentimientos obligatorios del Grupo A: ${missing.join(", ")}`,
        });
      }
      // BLOQUEO: sólo la base de tratamiento puede impedir el registro. Exigir
      // además la cesión de imagen o las comunicaciones por WhatsApp convertía
      // el consentimiento en condición para recibir el servicio, que es justo lo
      // que el Art. 7(4) no admite — y dejaba fuera a quien no quisiera salir en
      // una foto. Debe seguir en pie con buildConsentGroups del cliente.
      const OBLIGATORIOS = ["tratamiento_datos_bocatas"] as const;
      const denegados = OBLIGATORIOS.filter((p) => submittedMap.get(p) === false);
      if (denegados.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Sin el consentimiento de tratamiento de datos no se puede completar el registro.",
        });
      }

      const supabase = createAdminClient();
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
