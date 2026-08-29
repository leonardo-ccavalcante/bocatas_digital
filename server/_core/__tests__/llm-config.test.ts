/**
 * llm-config.test.ts — URL joining and per-task model resolution.
 *
 * The gateway base URL is user-supplied and may or may not already carry the
 * `/v1` suffix (OpenRouter's is `https://openrouter.ai/api/v1`; Manus Forge's
 * is a bare origin). Getting this wrong produces `/api/v1/v1/chat/completions`
 * → 404 → a generic "OCR failed" with no clue why.
 */
import { describe, it, expect } from "vitest";
import { chatCompletionsUrl, modelsUrl } from "../llm-payload";
import { resolveModels, assertLLMConfig } from "../llm-models";

describe("chatCompletionsUrl", () => {
  it("appends /v1/chat/completions to a bare origin", () => {
    expect(chatCompletionsUrl("https://forge.manus.im")).toBe(
      "https://forge.manus.im/v1/chat/completions"
    );
  });

  it("does NOT double /v1 when the base URL already ends in it", () => {
    expect(chatCompletionsUrl("https://openrouter.ai/api/v1")).toBe(
      "https://openrouter.ai/api/v1/chat/completions"
    );
  });

  it("tolerates a trailing slash", () => {
    expect(chatCompletionsUrl("https://openrouter.ai/api/v1/")).toBe(
      "https://openrouter.ai/api/v1/chat/completions"
    );
    expect(chatCompletionsUrl("https://forge.manus.im/")).toBe(
      "https://forge.manus.im/v1/chat/completions"
    );
  });

  it("derives the models endpoint the same way", () => {
    expect(modelsUrl("https://openrouter.ai/api/v1")).toBe("https://openrouter.ai/api/v1/models");
    expect(modelsUrl("https://forge.manus.im")).toBe("https://forge.manus.im/v1/models");
  });
});

describe("resolveModels — per-task overrides", () => {
  it("uses the task-specific model when set", () => {
    const m = resolveModels({
      LLM_MODEL: "google/gemini-2.5-flash",
      OCR_MODEL: "google/gemini-2.5-pro",
      INFORME_MODEL: "anthropic/claude-sonnet-4.6",
    });
    expect(m.default).toBe("google/gemini-2.5-flash");
    expect(m.ocr).toBe("google/gemini-2.5-pro");
    expect(m.informe).toBe("anthropic/claude-sonnet-4.6");
  });

  it("falls back to LLM_MODEL when a task model is unset", () => {
    const m = resolveModels({ LLM_MODEL: "google/gemini-2.5-flash" });
    expect(m.ocr).toBe("google/gemini-2.5-flash");
    expect(m.informe).toBe("google/gemini-2.5-flash");
  });

  it("ignores empty-string env vars (an unset slot in .env)", () => {
    const m = resolveModels({ LLM_MODEL: "gpt-5", OCR_MODEL: "   " });
    expect(m.ocr).toBe("gpt-5");
  });

  // There is no built-in default model any more: the gateway is provider-agnostic
  // and a guessed id (a bare "gemini-2.5-flash" against OpenRouter, which
  // namespaces ids as "google/gemini-2.5-flash") 404s at request time. Unset
  // must be visibly unset so assertConfigured can say so.
  it("returns undefined when nothing is configured", () => {
    const m = resolveModels({});
    expect(m.default).toBeUndefined();
    expect(m.ocr).toBeUndefined();
    expect(m.informe).toBeUndefined();
  });
});

describe("assertLLMConfig — every missing piece names itself", () => {
  const base = { apiKey: "sk-or-v1-x", baseUrl: "https://openrouter.ai/api/v1", model: "google/gemini-2.5-flash" };

  it("passes when all three are present", () => {
    expect(() => assertLLMConfig(base)).not.toThrow();
  });

  it("names LLM_API_KEY when the key is missing", () => {
    expect(() => assertLLMConfig({ ...base, apiKey: "" })).toThrow(/LLM_API_KEY/);
  });

  it("names LLM_BASE_URL when the base URL is missing", () => {
    expect(() => assertLLMConfig({ ...base, baseUrl: "" })).toThrow(/LLM_BASE_URL/);
  });

  it("names LLM_MODEL when no model resolves", () => {
    expect(() => assertLLMConfig({ ...base, model: undefined })).toThrow(/LLM_MODEL/);
  });
});
