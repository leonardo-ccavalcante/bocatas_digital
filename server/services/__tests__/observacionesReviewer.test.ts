/**
 * Tests for observacionesReviewer — the LLM-based reformulation service.
 *
 * Strategy: mock `invokeLLM` so tests are deterministic and free.
 * We verify the contract (null guards, pass-through, error resilience)
 * without actually calling the LLM.
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
});
