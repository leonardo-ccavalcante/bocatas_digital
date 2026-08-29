import { describe, it, expect, vi, beforeEach } from "vitest";
import { suggestCountryFromDocument } from "../../_core/ocr-country-detection";
import * as llmModule from "../../_core/llm";
import type { InvokeResult } from "../../_core/llm";

// Mock the LLM module
vi.mock("../../_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

describe("OCR Country Detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return a country suggestion with confidence score", async () => {
    // Mock LLM response
    const mockLLMResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggested_country_code: "FR",
              confidence: 0.95,
              reasoning: "Document shows French flag and 'République Française' text",
              alternative_suggestions: ["ES", "IT"],
            }),
          },
        },
      ],
    };

    vi.spyOn(llmModule, "invokeLLM").mockResolvedValue(mockLLMResponse as unknown as import("../../_core/llm").InvokeResult);

    const mockImage = Buffer.from("fake-image-data");
    const mockText = "République Française\nDocument d'identité";
    const paisOrigen = "FR";

    const result = await suggestCountryFromDocument(
      mockImage,
      mockText,
      paisOrigen
    );

    expect(result).toHaveProperty("suggested_country_code");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("reasoning");
    expect(result).toHaveProperty("alternative_suggestions");
    expect(result.suggested_country_code).toMatch(/^[A-Z]{2}$/); // ISO 3166-1 alpha-2
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.suggested_country_code).toBe("FR");
    expect(result.confidence).toBe(0.95);
  });

  it("should prioritize pais_origen as context hint", async () => {
    // Mock LLM response that prioritizes pais_origen
    const mockLLMResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggested_country_code: "ES",
              confidence: 0.88,
              reasoning: "Document appears Spanish, user is from Spain",
              alternative_suggestions: ["PT", "FR"],
            }),
          },
        },
      ],
    };

    vi.spyOn(llmModule, "invokeLLM").mockResolvedValue(mockLLMResponse as unknown as import("../../_core/llm").InvokeResult);

    const mockImage = Buffer.from("fake-image-data");
    const mockText = "Documento de identidad"; // Ambiguous text
    const paisOrigen = "ES"; // Spain hint

    const result = await suggestCountryFromDocument(
      mockImage,
      mockText,
      paisOrigen
    );

    // Should consider Spain as more likely
    expect(
      result.suggested_country_code === "ES" ||
        result.alternative_suggestions.includes("ES")
    ).toBe(true);
    expect(result.suggested_country_code).toBe("ES");
  });

  it("should handle LLM errors gracefully", async () => {
    vi.spyOn(llmModule, "invokeLLM").mockRejectedValue(
      new Error("LLM service unavailable")
    );

    const mockImage = Buffer.from("fake-image-data");
    const result = await suggestCountryFromDocument(
      mockImage,
      "Some text",
      undefined
    );

    // Should return empty suggestion on error, not throw
    expect(result.suggested_country_code).toBe("");
    expect(result.confidence).toBe(0);
    expect(result.reasoning).toBe("Error analyzing document");
  });

  it("should normalize country codes to uppercase", async () => {
    const mockLLMResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggested_country_code: "fr", // lowercase
              confidence: 0.9,
              reasoning: "French document",
              alternative_suggestions: ["es", "de"], // lowercase
            }),
          },
        },
      ],
    };

    vi.spyOn(llmModule, "invokeLLM").mockResolvedValue(mockLLMResponse as unknown as import("../../_core/llm").InvokeResult);

    const result = await suggestCountryFromDocument(
      Buffer.from("data"),
      "text",
      undefined
    );

    expect(result.suggested_country_code).toBe("FR");
    expect(result.alternative_suggestions).toEqual(["ES", "DE"]);
  });
});

// ── Regression: markdown-fenced JSON ─────────────────────────────────────────
// Models wrap JSON in ```json fences despite "Return ONLY valid JSON".
// suggestCountryFromDocument used a bare JSON.parse and sent NO response_format,
// so every fenced reply threw and was swallowed into an empty suggestion —
// indistinguishable from "the model could not identify the country".
describe("OCR Country Detection — non-strict model output", () => {
  beforeEach(() => vi.clearAllMocks());

  const respond = (content: string) =>
    vi.spyOn(llmModule, "invokeLLM").mockResolvedValue({
      choices: [{ message: { content } }],
    } as unknown as InvokeResult);

  it("parses JSON wrapped in a ```json fence", async () => {
    respond(
      '```json\n{"suggested_country_code":"MA","confidence":0.8,"reasoning":"CNIE","alternative_suggestions":[]}\n```'
    );
    const result = await suggestCountryFromDocument(Buffer.from("d"), "t", undefined);
    expect(result.suggested_country_code).toBe("MA");
    expect(result.confidence).toBe(0.8);
  });

  it("parses JSON surrounded by prose", async () => {
    respond(
      'Sure!\n{"suggested_country_code":"ro","confidence":0.6,"reasoning":"RO ID","alternative_suggestions":["md"]}\nHope this helps.'
    );
    const result = await suggestCountryFromDocument(Buffer.from("d"), "t", undefined);
    expect(result.suggested_country_code).toBe("RO");
    expect(result.alternative_suggestions).toEqual(["MD"]);
  });

  it("requests a json_schema response_format so the model is constrained", async () => {
    const spy = respond('{"suggested_country_code":"ES","confidence":1,"reasoning":"r","alternative_suggestions":[]}');
    await suggestCountryFromDocument(Buffer.from("d"), "t", undefined);
    const params = spy.mock.calls[0][0] as { response_format?: { type: string } };
    expect(params.response_format?.type).toBe("json_schema");
  });
});
