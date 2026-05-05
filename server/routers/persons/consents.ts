import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { protectedProcedure, router } from "../../_core/trpc";

export const consentsRouter = router({
  /**
   * Get programs list (public data, but proxied through tRPC for consistency).
   * Uses service role key to ensure programs are always visible.
   */
  programs: protectedProcedure.query(async () => {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("programs")
      .select("id, slug, name, description, icon, is_default, is_active, display_order")
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
  consentTemplates: protectedProcedure
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
   * Save consent records for a person.
   * Uses service role key to bypass RLS.
   */
  saveConsents: protectedProcedure
    .input(z.object({
      personId: z.string().uuid(),
      consents: z.array(z.object({
        purpose: z.enum(["tratamiento_datos_bocatas", "tratamiento_datos_banco_alimentos", "compartir_datos_red", "comunicaciones_whatsapp", "fotografia"]),
        idioma: z.enum(["es", "ar", "fr", "bm"]),
        granted: z.boolean(),
        granted_at: z.string(),
        consent_text: z.string().optional(),
        consent_version: z.string().optional(),
        documento_foto_url: z.string().url().optional().nullable(),
        registrado_por: z.string().uuid().optional().nullable(),
      })),
    }))
    .mutation(async ({ input }) => {
      if (input.consents.length === 0) return [];

      // Server-side enforcement: Group A consents are always required
      const GROUP_A = ["tratamiento_datos_bocatas", "fotografia", "comunicaciones_whatsapp"] as const;
      const submittedMap = new Map(input.consents.map((c) => [c.purpose, c.granted]));
      const missingA = GROUP_A.filter((p) => !submittedMap.has(p));
      if (missingA.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Faltan consentimientos obligatorios del Grupo A: ${missingA.join(", ")}`,
        });
      }
      const deniedA = GROUP_A.filter((p) => submittedMap.get(p) === false);
      if (deniedA.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El Grupo A de consentimientos es obligatorio para completar el registro.",
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
