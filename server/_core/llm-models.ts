// Gateway configuration and per-task model selection.
//
// Deliberately standalone (reads process.env directly rather than going
// through `./env`): OCR call sites need it, and `./env` performs secret
// validation with side effects that unit tests of pure OCR logic must not have
// to satisfy.
//
// There are NO built-in defaults for the gateway URL or the model. The gateway
// is provider-agnostic, and a guessed id (a bare "gemini-2.5-flash" against
// OpenRouter, which namespaces ids as "google/gemini-2.5-flash") 404s at
// request time and surfaces as a generic "OCR failed". Unset must be visibly
// unset so the error can name the variable to fix.

export type TaskModels = {
  /** Fallback for any call that does not name a model. */
  default?: string;
  /** Vision extraction: documents, actas, delivery sheets, lesson plans. */
  ocr?: string;
  /** Report generation. */
  informe?: string;
};

/** Reads LLM_MODEL, OCR_MODEL, INFORME_MODEL. Widened so process.env fits. */
export type ModelEnv = Record<string, string | undefined>;

const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/** Pure resolver — `env` injected so the precedence rules are testable. */
export function resolveModels(env: ModelEnv): TaskModels {
  const fallback = clean(env.LLM_MODEL);
  return {
    default: fallback,
    ocr: clean(env.OCR_MODEL) ?? fallback,
    informe: clean(env.INFORME_MODEL) ?? fallback,
  };
}

/**
 * Resolved per call rather than at import time so a test (or a process that
 * loads dotenv late) sees the current environment.
 */
export const models = (): TaskModels => resolveModels(process.env);

/** Model for every OCR call site. */
export const ocrModel = (): string | undefined => models().ocr;

/** Model for report generation. */
export const informeModel = (): string | undefined => models().informe;

export type LLMConfig = { apiKey: string; baseUrl: string; model?: string };

/**
 * Validate the gateway config, naming the exact variable to fix. Pure so the
 * message contract is testable; `llm.ts` wraps the throw in
 * LLMNotConfiguredError.
 */
export function assertLLMConfig(config: LLMConfig): asserts config is LLMConfig & { model: string } {
  const missing: string[] = [];
  if (!config.apiKey?.trim()) missing.push("LLM_API_KEY");
  if (!config.baseUrl?.trim()) missing.push("LLM_BASE_URL");
  if (!config.model?.trim()) missing.push("LLM_MODEL");

  if (missing.length > 0) {
    throw new Error(
      `${missing.join(", ")} not set — LLM/OCR features are disabled. Set them in ` +
        ".env (the SERVER reads .env, not .env.local) and verify with `pnpm llm:doctor`."
    );
  }
}
