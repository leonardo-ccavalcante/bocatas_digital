import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { voluntarioProcedure, router } from "../../_core/trpc";

export const consentsRouter = router({
  /**
   * Get programs list (public data, but proxied through tRPC for consistency).
   * Uses service role key to ensure programs are always visible.
   */
  programs: voluntarioProcedure.query(async () => {
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
   * Save consent records for a person. Uses the service role to bypass RLS —
   * the tRPC guard is the enforcement boundary (ADR-0002).
   *
   * Group A invariant: AFTER every save, each Group A purpose has a granted
   * consent row. The registration wizard submits ALL purposes; the ficha's
   * ConsentModal (RC-03/F050) submits PARTIAL updates, which are legal only
   * when the omitted Group A purposes are already granted in the DB. Group A
   * can never be set to granted:false.
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

const GROUP_A = ["tratamiento_datos_bocatas", "fotografia", "comunicaciones_whatsapp"] as const;

async function assertGroupACovered(
  supabase: ReturnType<typeof createAdminClient>,
  personId: string,
  consents: Array<{ purpose: string; granted: boolean }>,
): Promise<void> {
  const submitted = new Map(consents.map((c) => [c.purpose, c.granted]));
  const deniedA = GROUP_A.filter((p) => submitted.get(p) === false);
  if (deniedA.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "El Grupo A de consentimientos es obligatorio para completar el registro.",
    });
  }
  const missingA = GROUP_A.filter((p) => !submitted.has(p));
  if (missingA.length === 0) return;
  const { data, error } = await supabase
    .from("consents")
    .select("purpose")
    .eq("person_id", personId)
    .eq("granted", true)
    .in("purpose", missingA);
  if (error) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error al comprobar los consentimientos existentes" });
  }
  const covered = new Set((data ?? []).map((r) => r.purpose));
  const stillMissing = missingA.filter((p) => !covered.has(p));
  if (stillMissing.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Faltan consentimientos obligatorios del Grupo A: ${stillMissing.join(", ")}`,
    });
  }
}
