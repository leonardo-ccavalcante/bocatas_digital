/**
 * ocr.empty-extraction.test.ts — "hice la foto y no rellena nada" (ALTAS-1).
 *
 * Cuando el modelo no consigue leer la foto devuelve TODOS los campos a null —
 * es lo que el propio prompt le pide ("use null for missing", y
 * `Sin_Documentacion` cuando no reconoce el documento). Ese objeto validaba sin
 * problema (`OCRResultSchema.data` es todo `.nullish()`) y salía con
 * `success: true`, así que el cliente pintaba «Datos extraídos» sobre un
 * formulario vacío, escribía `tipo_documento` a espaldas del voluntario y
 * retiraba el botón de escanear: no había forma de reintentar sin recargar.
 *
 * Regla: sin ningún campo de identidad no hay extracción. Un `tipo_documento`
 * suelto no cuenta como dato.
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

function ctx(): TrpcContext {
  const user: AuthenticatedUser = {
    id: "test-user-1",
    openId: "test-user",
    email: "voluntario@bocatas.org",
    name: "voluntario",
    loginMethod: "manus",
    role: "voluntario",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    logger: new Logger(),
    correlationId: "ocr-empty-extraction-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function mockLLMContent(payload: Record<string, unknown>) {
  return {
    id: "test",
    created: 0,
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

const ALL_NULL = {
  tipo_documento: "Sin_Documentacion",
  numero_documento: null,
  nombre: null,
  apellidos: null,
  fecha_nacimiento: null,
  pais_origen: null,
  pais_documento: null,
  genero: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ocr.extractDocument — extracción vacía", () => {
  it("no declara éxito cuando no se leyó ningún campo de identidad", async () => {
    vi.mocked(invokeLLM).mockResolvedValue(mockLLMContent(ALL_NULL));

    const result = await ocrRouter.createCaller(ctx()).extractDocument({
      base64Image: "ZmFrZQ==",
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe("unreadable");
  });

  it("no devuelve un tipo_documento inventado en la respuesta vacía", async () => {
    vi.mocked(invokeLLM).mockResolvedValue(mockLLMContent(ALL_NULL));

    const result = await ocrRouter.createCaller(ctx()).extractDocument({
      base64Image: "ZmFrZQ==",
    });

    expect(result.data.tipo_documento ?? null).toBeNull();
  });

  it("un solo campo de identidad legible ya cuenta como éxito", async () => {
    vi.mocked(invokeLLM).mockResolvedValue(
      mockLLMContent({ ...ALL_NULL, tipo_documento: "DNI", numero_documento: "12345678Z" })
    );

    const result = await ocrRouter.createCaller(ctx()).extractDocument({
      base64Image: "ZmFrZQ==",
    });

    expect(result.success).toBe(true);
    expect(result.data.numero_documento).toBe("12345678Z");
  });

  it("sigue devolviendo la extracción completa cuando se lee todo", async () => {
    vi.mocked(invokeLLM).mockResolvedValue(
      mockLLMContent({
        tipo_documento: "NIE",
        numero_documento: "X1234567L",
        nombre: "Awa",
        apellidos: "Diop",
        fecha_nacimiento: "1992-03-10",
        pais_origen: "SN",
        pais_documento: "ES",
        genero: "femenino",
      })
    );

    const result = await ocrRouter.createCaller(ctx()).extractDocument({
      base64Image: "ZmFrZQ==",
    });

    expect(result.success).toBe(true);
    expect(result.data.nombre).toBe("Awa");
    expect(result.data.tipo_documento).toBe("nie");
  });
});
