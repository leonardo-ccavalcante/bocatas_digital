/**
 * Tests for observacionesReviewer — the LLM-based reformulation service.
 *
 * Strategy: mock `invokeLLM` so tests are deterministic and free.
 * We verify:
 *   - null guards, pass-through, error resilience
 *   - structured-context deduplication (no repetition of compositor fields)
 *   - integrity rules: no assumptions, no vague references, no invented data
 *     (the 4 agreements as implicit baseline)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM helper BEFORE importing the module under test
vi.mock("../../_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { reviewObservaciones } from "../observacionesReviewer";
import { invokeLLM } from "../../_core/llm";

const mockInvokeLLM = vi.mocked(invokeLLM);

function makeLLMResponse(textoRevisado: string | null) {
  return {
    id: "test-id",
    created: 0,
    model: "gpt-5-mini",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant" as const,
          content: JSON.stringify({ texto_revisado: textoRevisado }),
        },
        finish_reason: "stop",
      },
    ],
  };
}

describe("reviewObservaciones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Basic contract ──────────────────────────────────────────────────────────

  it("returns null immediately for null input (no LLM call)", async () => {
    const result = await reviewObservaciones(null);
    expect(result).toBeNull();
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("returns null immediately for empty string (no LLM call)", async () => {
    const result = await reviewObservaciones("");
    expect(result).toBeNull();
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("returns null immediately for very short text < 10 chars (no LLM call)", async () => {
    const result = await reviewObservaciones("ok");
    expect(result).toBeNull();
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("calls invokeLLM and returns the reformulated text", async () => {
    mockInvokeLLM.mockResolvedValueOnce(
      makeLLMResponse("La unidad familiar presenta una situación de vulnerabilidad socioeconómica.")
    );

    const result = await reviewObservaciones(
      "familia muy pobre, no tienen trabajo y viven en un piso muy pequeño"
    );

    expect(mockInvokeLLM).toHaveBeenCalledOnce();
    expect(result).toBe(
      "La unidad familiar presenta una situación de vulnerabilidad socioeconómica."
    );
  });

  it("returns null when LLM returns null texto_revisado", async () => {
    mockInvokeLLM.mockResolvedValueOnce(makeLLMResponse(null));

    const result = await reviewObservaciones(
      "notas que el LLM considera no aptas para el informe"
    );

    expect(result).toBeNull();
  });

  it("returns null when LLM returns empty string texto_revisado", async () => {
    mockInvokeLLM.mockResolvedValueOnce(makeLLMResponse(""));

    const result = await reviewObservaciones("algunas notas del entrevistador");

    expect(result).toBeNull();
  });

  it("is resilient to LLM errors — returns null instead of throwing", async () => {
    mockInvokeLLM.mockRejectedValueOnce(new Error("LLM timeout"));

    const result = await reviewObservaciones(
      "notas del entrevistador que causan error en el LLM"
    );

    expect(result).toBeNull();
  });

  it("is resilient to malformed LLM JSON — returns null instead of throwing", async () => {
    mockInvokeLLM.mockResolvedValueOnce({
      id: "test",
      created: 0,
      model: "gpt-5-mini",
      choices: [
        {
          index: 0,
          message: { role: "assistant" as const, content: "not-valid-json" },
          finish_reason: "stop",
        },
      ],
    });

    const result = await reviewObservaciones("notas del entrevistador");

    expect(result).toBeNull();
  });

  it("passes the raw observaciones text to the LLM in the user message", async () => {
    mockInvokeLLM.mockResolvedValueOnce(
      makeLLMResponse("Texto reformulado.")
    );

    const rawText = "Matrimonio con dos hijos, el mayor trabaja en mercadillos";
    await reviewObservaciones(rawText);

    const callArgs = mockInvokeLLM.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m) => m.role === "user");
    expect(userMessage?.content).toContain(rawText);
  });

  // ── Structured context deduplication ────────────────────────────────────────

  it("includes structured context in the system prompt when provided", async () => {
    mockInvokeLLM.mockResolvedValueOnce(
      makeLLMResponse("Han iniciado el trámite para la Renta Mínima Vital.")
    );

    await reviewObservaciones(
      "Matrimonio con una hija menor de dos años. Residen en España desde hace seis años. Han iniciado el trámite para la RMV.",
      {
        num_adultos: 2,
        num_menores: 1,
        pais_origen: "PH",
        distrito: "puente-de-vallecas",
      }
    );

    const callArgs = mockInvokeLLM.mock.calls[0][0];
    const systemMessage = callArgs.messages.find((m) => m.role === "system");
    expect(systemMessage?.content).toContain("2 personas adultas");
    expect(systemMessage?.content).toContain("1 menor");
    expect(systemMessage?.content).toContain("Filipinas");
    expect(systemMessage?.content).toContain("puente-de-vallecas");
  });

  it("system prompt instructs LLM to NOT repeat structured info when context provided", async () => {
    mockInvokeLLM.mockResolvedValueOnce(
      makeLLMResponse("Han iniciado el trámite para la Renta Mínima Vital.")
    );

    await reviewObservaciones(
      "Matrimonio con una hija menor de dos años. Han iniciado el trámite para la RMV.",
      {
        num_adultos: 2,
        num_menores: 1,
        pais_origen: "PH",
        distrito: "puente-de-vallecas",
      }
    );

    const callArgs = mockInvokeLLM.mock.calls[0][0];
    const systemMessage = callArgs.messages.find((m) => m.role === "system");
    expect(systemMessage?.content).toMatch(/NO repitas|no repitas|no vuelvas a mencionar|omite.*ya.*cubierta/i);
  });

  it("does NOT include structured context block in system prompt when context is omitted", async () => {
    mockInvokeLLM.mockResolvedValueOnce(
      makeLLMResponse("La familia presenta necesidades socioeconómicas.")
    );

    await reviewObservaciones("familia con muchas necesidades");

    const callArgs = mockInvokeLLM.mock.calls[0][0];
    const systemMessage = callArgs.messages.find((m) => m.role === "system");
    expect(systemMessage?.content).not.toContain("ya está cubierta");
  });

  it("works correctly when context has null fields (partial context)", async () => {
    mockInvokeLLM.mockResolvedValueOnce(
      makeLLMResponse("La familia presenta necesidades de vivienda.")
    );

    const result = await reviewObservaciones(
      "Familia sin vivienda estable, buscan piso de alquiler.",
      {
        num_adultos: 1,
        num_menores: 0,
        pais_origen: null,
        distrito: null,
      }
    );

    expect(result).toBe("La familia presenta necesidades de vivienda.");
    const callArgs = mockInvokeLLM.mock.calls[0][0];
    const systemMessage = callArgs.messages.find((m) => m.role === "system");
    expect(systemMessage?.content).toContain("1 persona adulta");
  });

  // ── Integrity rules: los 4 acuerdos como baseline ───────────────────────────
  // These tests verify that the system prompt enforces strict integrity:
  // no assumptions, no vague references, no invented data.

  it("system prompt explicitly forbids inventing or inferring data not in the notes", async () => {
    mockInvokeLLM.mockResolvedValueOnce(makeLLMResponse("Texto."));

    await reviewObservaciones("familia con dificultades económicas");

    const callArgs = mockInvokeLLM.mock.calls[0][0];
    const systemMessage = callArgs.messages.find((m) => m.role === "system");
    const content = systemMessage?.content as string;

    // Must explicitly forbid inventing or inferring
    expect(content).toMatch(/NO inventes|no inventes/i);
    expect(content).toMatch(/NO inferas|no inferas/i);
  });

  it("system prompt forbids vague references to benefits/procedures without naming them", async () => {
    mockInvokeLLM.mockResolvedValueOnce(makeLLMResponse("Texto."));

    await reviewObservaciones("familia con dificultades económicas");

    const callArgs = mockInvokeLLM.mock.calls[0][0];
    const systemMessage = callArgs.messages.find((m) => m.role === "system");
    const content = systemMessage?.content as string;

    // Must instruct to name things exactly as stated in the notes
    expect(content).toMatch(
      /nombre exacto|tal como aparece|exactamente como|sin generalizar|sin parafrasear con términos vagos/i
    );
  });

  it("system prompt instructs to omit rather than generalize when specifics are missing", async () => {
    mockInvokeLLM.mockResolvedValueOnce(makeLLMResponse("Texto."));

    await reviewObservaciones("familia con dificultades económicas");

    const callArgs = mockInvokeLLM.mock.calls[0][0];
    const systemMessage = callArgs.messages.find((m) => m.role === "system");
    const content = systemMessage?.content as string;

    // Must instruct to omit rather than invent vague filler
    expect(content).toMatch(/omite|omítelo|no incluyas|deja fuera/i);
  });
});
