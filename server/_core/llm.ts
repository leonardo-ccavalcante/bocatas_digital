// Transport for the OpenAI-compatible LLM gateway.
//
// Request/response shaping is pure and lives in `llm-payload.ts` (tested).
// This file only owns: configuration, the fetch, and error typing.

import { ENV } from "./env";
import {
  buildPayload,
  chatCompletionsUrl,
  modelsUrl,
  DEFAULT_MAX_TOKENS,
} from "./llm-payload";
import type { InvokeParams, InvokeResult } from "./llm-payload";
import { assertLLMConfig, models } from "./llm-models";

export * from "./llm-payload";

/**
 * Thrown when the gateway is not configured at all. Distinct from a transport
 * failure so callers can tell "OCR is switched off in this environment" from
 * "the model could not read the document" — previously both collapsed into an
 * indistinguishable `{ success: false }`.
 */
export class LLMNotConfiguredError extends Error {
  readonly reason = "not_configured" as const;
  constructor(message: string) {
    super(message);
    this.name = "LLMNotConfiguredError";
  }
}

/** Thrown when the gateway is reachable but rejected or failed the request. */
export class LLMRequestError extends Error {
  readonly reason = "llm_error" as const;
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "LLMRequestError";
  }
}

/**
 * Resolve and validate the gateway config. There is NO default host and NO
 * default model: the gateway is provider-agnostic, so a guessed value fails at
 * request time with an error that names nothing useful. Missing config throws
 * here instead, naming the exact variable to set.
 */
const resolveConfig = (model?: string) => {
  const config = {
    apiKey: ENV.llmApiKey ?? "",
    baseUrl: ENV.llmBaseUrl ?? "",
    model: model ?? models().default,
  };
  try {
    assertLLMConfig(config);
  } catch (error) {
    throw new LLMNotConfiguredError(
      error instanceof Error ? error.message : String(error)
    );
  }
  return config;
};

/** True when the gateway is fully configured. */
export const isLLMConfigured = (): boolean => {
  try {
    resolveConfig();
    return true;
  } catch {
    return false;
  }
};

const authHeaders = (apiKey: string) => ({
  "content-type": "application/json",
  authorization: `Bearer ${apiKey}`,
});

/**
 * Gateway error bodies can echo the request back, and our requests carry
 * base64 identity documents while responses carry names / NIE. Never surface
 * the body verbatim — cap it hard so a status stays diagnosable without
 * becoming a PII leak (CLAUDE.md §Compliance).
 */
const summarizeErrorBody = (body: string): string =>
  body.replace(/\s+/g, " ").slice(0, 200);

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const { apiKey, baseUrl, model } = resolveConfig(params.model);

  const payload = buildPayload(params, { model, maxTokens: DEFAULT_MAX_TOKENS });

  let response: Response;
  try {
    response = await fetch(chatCompletionsUrl(baseUrl), {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify(payload),
    });
  } catch (cause) {
    throw new LLMRequestError(
      `LLM gateway unreachable at ${baseUrl}: ${
        cause instanceof Error ? cause.message : String(cause)
      }`
    );
  }

  if (!response.ok) {
    throw new LLMRequestError(
      `LLM invoke failed: ${response.status} ${response.statusText} – ` +
        summarizeErrorBody(await response.text()),
      response.status
    );
  }

  return (await response.json()) as InvokeResult;
}

export type LLMModel = { id: string; object?: string; owned_by?: string };

/**
 * Gateway model catalog. Documented in references/llm-integration.md but never
 * actually implemented — use it to discover valid ids instead of hardcoding
 * one that may not exist on the configured gateway.
 */
export async function listLLMModels(): Promise<{ data: LLMModel[] }> {
  const { apiKey, baseUrl } = resolveConfig();

  const response = await fetch(modelsUrl(baseUrl), {
    headers: authHeaders(apiKey),
  });

  if (!response.ok) {
    throw new LLMRequestError(
      `LLM model list failed: ${response.status} ${response.statusText} – ` +
        summarizeErrorBody(await response.text()),
      response.status
    );
  }

  return (await response.json()) as { data: LLMModel[] };
}
