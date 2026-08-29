// Transport-layer tests for the LLM helper.
//
// WHY THIS FILE EXISTS: every OCR test in this repo mocks `invokeLLM` away, so
// the request *payload* — the layer where the OCR outage actually lived — had
// zero coverage while CI stayed green. These tests pin the payload contract
// documented in `references/llm-integration.md`.

import { describe, it, expect } from "vitest";
import { buildPayload, parseJsonContent, DEFAULT_MAX_TOKENS } from "../llm-payload";
import type { InvokeParams, PayloadDefaults } from "../llm-payload";

// There is no built-in default MODEL any more (see llm-models.ts) — callers
// always resolve one, so the tests supply it explicitly.
const DEFAULTS: PayloadDefaults = { model: "test-model", maxTokens: DEFAULT_MAX_TOKENS };

const msg: InvokeParams["messages"] = [{ role: "user", content: "hi" }];

describe("buildPayload — model selection", () => {
  it("uses the caller's model when provided", () => {
    const p = buildPayload({ messages: msg, model: "claude-sonnet-4-6" }, DEFAULTS);
    expect(p.model).toBe("claude-sonnet-4-6");
  });

  it("falls back to the configured default model", () => {
    const p = buildPayload({ messages: msg }, { ...DEFAULTS, model: "gpt-5" });
    expect(p.model).toBe("gpt-5");
  });
});

describe("buildPayload — max_tokens", () => {
  it("honours camelCase maxTokens from the caller", () => {
    const p = buildPayload({ messages: msg, maxTokens: 512 }, DEFAULTS);
    expect(p.max_tokens).toBe(512);
  });

  it("honours snake_case max_tokens from the caller", () => {
    const p = buildPayload({ messages: msg, max_tokens: 777 }, DEFAULTS);
    expect(p.max_tokens).toBe(777);
  });

  it("falls back to the default when the caller omits it", () => {
    const p = buildPayload({ messages: msg }, DEFAULTS);
    expect(p.max_tokens).toBe(DEFAULTS.maxTokens);
  });
});

describe("buildPayload — thinking / reasoning are caller-owned", () => {
  // REGRESSION: the helper used to hardcode `thinking: { budget_tokens: 128 }`
  // on EVERY request. That shape is Gemini-specific and below Anthropic's
  // 1024 minimum, so any claude-* model 400s and Gemini burns output tokens on
  // reasoning it cannot finish — returning empty content that every OCR caller
  // silently mapped to `{ success: false }`.
  it("does not inject thinking when the caller omits it", () => {
    const p = buildPayload({ messages: msg }, DEFAULTS);
    expect(p).not.toHaveProperty("thinking");
    expect(p).not.toHaveProperty("reasoning");
  });

  it("forwards the caller's thinking block unchanged", () => {
    const thinking = { type: "enabled", budget_tokens: 2048 };
    const p = buildPayload({ messages: msg, thinking }, DEFAULTS);
    expect(p.thinking).toEqual(thinking);
  });

  it("forwards the caller's reasoning block unchanged", () => {
    const p = buildPayload({ messages: msg, reasoning: { effort: "low" } }, DEFAULTS);
    expect(p.reasoning).toEqual({ effort: "low" });
  });
});

describe("buildPayload — message normalization", () => {
  it("collapses a lone text part to a plain string", () => {
    const p = buildPayload({ messages: msg }, DEFAULTS);
    expect((p.messages as unknown[])[0]).toEqual({ role: "user", content: "hi" });
  });

  it("preserves multipart image content (the OCR path)", () => {
    const p = buildPayload(
      {
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAA", detail: "high" } },
              { type: "text", text: "extract" },
            ],
          },
        ],
      },
      DEFAULTS
    );
    const parts = (p.messages as Array<{ content: unknown[] }>)[0].content;
    expect(parts).toHaveLength(2);
    expect((parts[0] as { type: string }).type).toBe("image_url");
  });
});

describe("buildPayload — tool_choice", () => {
  const tools: InvokeParams["tools"] = [
    { type: "function", function: { name: "only_tool" } },
  ];

  it("expands 'required' to the single configured tool", () => {
    const p = buildPayload({ messages: msg, tools, toolChoice: "required" }, DEFAULTS);
    expect(p.tool_choice).toEqual({ type: "function", function: { name: "only_tool" } });
  });

  it("throws when 'required' is used with no tools", () => {
    expect(() => buildPayload({ messages: msg, toolChoice: "required" }, DEFAULTS)).toThrow();
  });
});

describe("buildPayload — response_format", () => {
  it("passes an explicit json_schema through", () => {
    const rf = {
      type: "json_schema" as const,
      json_schema: { name: "x", schema: { type: "object" }, strict: true },
    };
    const p = buildPayload({ messages: msg, response_format: rf }, DEFAULTS);
    expect(p.response_format).toEqual(rf);
  });

  it("omits response_format entirely when unset", () => {
    const p = buildPayload({ messages: msg }, DEFAULTS);
    expect(p).not.toHaveProperty("response_format");
  });
});

describe("parseJsonContent", () => {
  // Models routinely wrap JSON in markdown despite the prompt saying not to.
  // `ocr-country-detection.ts` called bare JSON.parse and died on every fence.
  it("parses plain JSON", () => {
    expect(parseJsonContent('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips a ```json fence", () => {
    expect(parseJsonContent('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("strips a bare ``` fence", () => {
    expect(parseJsonContent('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("recovers JSON surrounded by prose", () => {
    expect(parseJsonContent('Here you go:\n{"a":1}\nHope that helps!')).toEqual({ a: 1 });
  });

  it("throws on content with no JSON at all", () => {
    expect(() => parseJsonContent("I cannot read this image.")).toThrow();
  });
});
