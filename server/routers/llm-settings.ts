/**
 * llm-settings.ts — tRPC router for LLM provider configuration.
 *
 * Procedures:
 *   - listModels: fetches available models from the configured provider
 *   - getConfig: returns current LLM configuration (without the API key)
 *   - updateConfig: updates LLM_BASE_URL, LLM_MODEL (superadmin only)
 *
 * The API key is managed via environment variables (secrets), not stored in DB.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, superadminProcedure, protectedProcedure } from "../_core/trpc";
import { listAvailableModels } from "../_core/llm";
import { createAdminClient } from "../../client/src/lib/supabase/server";

export const llmSettingsRouter = router({
  /**
   * List available models from the configured LLM provider.
   * Superadmin only — used in the settings dropdown.
   */
  listModels: superadminProcedure.query(async () => {
    try {
      const models = await listAvailableModels();
      return { models };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to fetch models: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }),

  /**
   * Get current LLM configuration (safe — no API key exposed).
   */
  getConfig: protectedProcedure.query(async () => {
    // Read from app_settings table if it exists, otherwise from env
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "llm_config")
      .maybeSingle();

    if (data?.value) {
      const config = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
      return {
        baseUrl: config.base_url || process.env.LLM_BASE_URL || "",
        model: config.model || process.env.LLM_MODEL || "google/gemini-2.5-flash",
        provider: detectProvider(config.base_url || process.env.LLM_BASE_URL || ""),
        hasApiKey: !!(process.env.LLM_API_KEY || process.env.BUILT_IN_FORGE_API_KEY),
      };
    }

    return {
      baseUrl: process.env.LLM_BASE_URL || "",
      model: process.env.LLM_MODEL || "gemini-2.5-flash",
      provider: detectProvider(process.env.LLM_BASE_URL || ""),
      hasApiKey: !!(process.env.LLM_API_KEY || process.env.BUILT_IN_FORGE_API_KEY),
    };
  }),

  /**
   * Update LLM configuration (superadmin only).
   * Persists base_url and model in app_settings table.
   * The API key must be set via environment variables (secrets).
   */
  updateConfig: superadminProcedure
    .input(
      z.object({
        baseUrl: z.string().url().optional(),
        model: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();

      const config = {
        base_url: input.baseUrl || process.env.LLM_BASE_URL || "",
        model: input.model,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("app_settings")
        .upsert(
          { key: "llm_config", value: JSON.stringify(config) },
          { onConflict: "key" }
        );

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to save LLM config: ${error.message}`,
        });
      }

      return { success: true, config };
    }),
});

function detectProvider(baseUrl: string): string {
  if (!baseUrl) return "manus-forge";
  if (baseUrl.includes("openrouter.ai")) return "openrouter";
  if (baseUrl.includes("openai.com")) return "openai";
  if (baseUrl.includes("anthropic.com")) return "anthropic";
  if (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1")) return "local";
  return "custom";
}
