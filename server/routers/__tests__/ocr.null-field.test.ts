/**
 * ocr.null-field.test.ts — MYT-135A (gh #135)
 *
 * ocr.ts:44-70 instructs the LLM to emit `null` for any illegible/absent
 * field ("use null for missing") and its own json_schema marks every field
 * `type: ["string", "null"]`. But OCRResultSchema.data (client/src/features/
 * persons/schemas/related.ts) types those same fields `.optional()`
 * (string|undefined) — which rejects `null`. So a SINGLE null field (e.g. a
 * worn/foreign document where only the country code is illegible) makes
 * `OCRResultSchema.safeParse` fail at ocr.ts:163, and the resolver discards
 * every other correctly-extracted field, returning `{ success:false, data:{} }`
 * (ocr.ts:170). DocumentCaptureInline.tsx then autocompletes NOTHING.
 *
 * Real resolver test per house pattern: `ocrRouter.createCaller` +
 * `vi.mock` of the LLM client (never mock the resolver itself).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from "../../_core/llm";
import { ocrRouter } from "../ocr";
import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctxWithRole(role: AuthenticatedUser["role"]): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: `${role}@bocatas.org`,
    name: role,
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    logger: new Logger(),
    correlationId: "ocr-null-field-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function mockLLMContent(payload: Record<string, unknown>) {
  return {
    id: "test",
    created: Date.now(),
    model: "test-model",
    choices: [
      {
        index: 0,
        message: { role: "assistant" as const, content: JSON.stringify(payload) },
        finish_reason: "stop",
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ocr.extractDocument — MYT-135A null-field tolerance", () => {
  it("still returns the 6 successfully-extracted fields when only pais_documento is null", async () => {
    // Exactly what the LLM legitimately emits for a worn/foreign document per
    // ocr.ts's own prompt ("use null for missing"): 6 readable fields + one
    // illegible field as null.
    vi.mocked(invokeLLM).mockResolvedValue(
      mockLLMContent({
        tipo_documento: "Documento_Extranjero",
        numero_documento: "AB123456",
        nombre: "Fatima",
        apellidos: "El Amrani",
        fecha_nacimiento: "1990-05-12",
        pais_origen: "MA",
        pais_documento: null,
        genero: null,
      })
    );

    const caller = ocrRouter.createCaller(ctxWithRole("voluntario"));
    const result = await caller.extractDocument({ base64Image: "ZmFrZQ==" });

    // RED (current behavior): OCRResultSchema.safeParse fails because
    // pais_documento is null (schema types it `.optional()`, not nullable),
    // so the resolver falls back to `{ success:false, data:{} }` and every
    // field below is lost. GREEN (post-fix): success is true and the 6 good
    // fields survive.
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      nombre: "Fatima",
      apellidos: "El Amrani",
      fecha_nacimiento: "1990-05-12",
      numero_documento: "AB123456",
      pais_origen: "MA",
    });
  });
});
