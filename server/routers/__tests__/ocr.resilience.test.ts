/**
 * ocr.resilience.test.ts — the OCR outage regressions.
 *
 * Every failure mode below previously produced the SAME opaque result —
 * `{ success: false, data: {} }` — so "OCR is not working" was undiagnosable
 * from the outside. House pattern: real resolver via `createCaller`, LLM
 * transport mocked (never the resolver).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Partial mock: keep the real error classes, stub only the transport. A bare
// factory would drop LLMNotConfiguredError and break the taxonomy assertions.
vi.mock("../../_core/llm", async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  invokeLLM: vi.fn(),
}));

import { invokeLLM, LLMNotConfiguredError } from "../../_core/llm";
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
    correlationId: "ocr-resilience-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const reply = (content: string) =>
  vi.mocked(invokeLLM).mockResolvedValue({
    id: "t",
    created: 0,
    model: "m",
    choices: [
      { index: 0, message: { role: "assistant" as const, content }, finish_reason: "stop" },
    ],
  });

const call = () =>
  ocrRouter.createCaller(ctx()).extractDocument({ base64Image: "ZmFrZQ==" });

const GOOD = {
  tipo_documento: "DNI",
  numero_documento: "12345678Z",
  nombre: "Ana",
  apellidos: "García",
  fecha_nacimiento: "1990-05-12",
  pais_origen: "ES",
  pais_documento: "ES",
  genero: "femenino",
};

beforeEach(() => vi.clearAllMocks());

describe("ocr.extractDocument — model output that is not bare JSON", () => {
  it("parses a ```json-fenced response", async () => {
    reply("```json\n" + JSON.stringify(GOOD) + "\n```");
    const result = await call();
    expect(result.success).toBe(true);
    expect(result.data.nombre).toBe("Ana");
  });

  it("parses a response with prose around the JSON", async () => {
    reply("Here is the extracted data:\n" + JSON.stringify(GOOD) + "\nLet me know!");
    const result = await call();
    expect(result.success).toBe(true);
    expect(result.data.numero_documento).toBe("12345678Z");
  });
});

describe("ocr.extractDocument — off-format fields must not discard the good ones", () => {
  // Same bug class as MYT-135A, still live on two fields: the json_schema is
  // sent with `strict:false`, so the API does NOT enforce formats. One
  // off-format value failed the whole `data` parse and threw away every
  // correctly-read field.
  it("keeps the other fields when fecha_nacimiento comes back as DD/MM/YYYY", async () => {
    reply(JSON.stringify({ ...GOOD, fecha_nacimiento: "12/05/1990" }));
    const result = await call();
    expect(result.success).toBe(true);
    expect(result.data.nombre).toBe("Ana");
    expect(result.data.numero_documento).toBe("12345678Z");
    expect(result.data.fecha_nacimiento).toBeUndefined();
  });

  it("keeps the other fields when pais_documento comes back as a country name", async () => {
    reply(JSON.stringify({ ...GOOD, pais_documento: "Spain" }));
    const result = await call();
    expect(result.success).toBe(true);
    expect(result.data.apellidos).toBe("García");
    expect(result.data.pais_documento).toBeUndefined();
  });
});

describe("ocr.extractDocument — failures are distinguishable", () => {
  it("reports 'not_configured' when the gateway has no API key", async () => {
    vi.mocked(invokeLLM).mockRejectedValue(
      new LLMNotConfiguredError("BUILT_IN_FORGE_API_KEY is not set")
    );
    const result = await call();
    expect(result.success).toBe(false);
    expect(result.reason).toBe("not_configured");
  });

  it("reports 'llm_error' when the gateway rejects the request", async () => {
    vi.mocked(invokeLLM).mockRejectedValue(new Error("400 Bad Request"));
    const result = await call();
    expect(result.success).toBe(false);
    expect(result.reason).toBe("llm_error");
  });

  it("reports 'unreadable' when the model returns no usable JSON", async () => {
    reply("I'm sorry, the image is too blurry to read.");
    const result = await call();
    expect(result.success).toBe(false);
    expect(result.reason).toBe("unreadable");
  });

  it("reports 'unreadable' on empty content", async () => {
    reply("");
    const result = await call();
    expect(result.success).toBe(false);
    expect(result.reason).toBe("unreadable");
  });
});

// ── Per-task model routing ───────────────────────────────────────────────────
// OCR is vision-heavy and gets its own model (OCR_MODEL) so it can be a
// stronger/vision-capable model than the general LLM_MODEL default.
describe("ocr.extractDocument — model routing", () => {
  const OLD = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD };
  });

  it("sends OCR_MODEL when it is set", async () => {
    process.env.LLM_MODEL = "google/gemini-2.5-flash";
    process.env.OCR_MODEL = "google/gemini-2.5-pro";
    reply(JSON.stringify(GOOD));

    await call();

    const params = vi.mocked(invokeLLM).mock.calls[0][0];
    expect(params.model).toBe("google/gemini-2.5-pro");
  });

  it("falls back to LLM_MODEL when OCR_MODEL is unset", async () => {
    process.env.LLM_MODEL = "google/gemini-2.5-flash";
    delete process.env.OCR_MODEL;
    reply(JSON.stringify(GOOD));

    await call();

    expect(vi.mocked(invokeLLM).mock.calls[0][0].model).toBe("google/gemini-2.5-flash");
  });
});

// ── Truncation ───────────────────────────────────────────────────────────────
// Reasoning models (OCR_MODEL is google/gemini-2.5-pro here) spend output
// tokens thinking before the first JSON byte — measured at 200–970 tokens for
// a single-pixel probe. If the ceiling is hit, content arrives truncated and
// unparseable; that must be reported as its own reason, not as "the document
// was unreadable", because the fix is a config change, not a better photo.
describe("ocr.extractDocument — truncated output", () => {
  it("reports 'truncated' when the model ran out of output tokens", async () => {
    vi.mocked(invokeLLM).mockResolvedValue({
      id: "t",
      created: 0,
      model: "google/gemini-2.5-pro",
      choices: [
        {
          index: 0,
          message: { role: "assistant" as const, content: 'Here is the JSON: {"nombre": "An' },
          finish_reason: "length",
        },
      ],
    });

    const result = await call();
    expect(result.success).toBe(false);
    expect(result.reason).toBe("truncated");
  });
});
