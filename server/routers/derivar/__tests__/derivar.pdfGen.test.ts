/**
 * derivar.pdfGen.test.ts
 *
 * Contract tests for derivar.generateDocx and derivar.generatePdf.
 *
 * Asserts:
 *   - Role guard: voluntario/unauthenticated → FORBIDDEN.
 *   - generateDocx calls renderDerivarHojaDocx with DerivarHojaTemplateData.
 *   - generateDocx returns {contentBase64, filename, mime}.
 *   - generatePdf also calls convertDocxToPdf after renderDerivarHojaDocx.
 *
 * Binary integration tests (real template, real LibreOffice) deferred to
 * __INTEGRATION_DB__ suite — marked as it.todo per project pattern.
 */

import type { TRPCError } from "@trpc/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { TrpcContext } from "../../../_core/context";
import { Logger } from "../../../_core/logger";

// ─── vi.mock — must precede router imports ──────────────────────────────────
// vi.mock factories are hoisted; do NOT reference outer let/const variables
// inside the factory. Instead, vi.fn() inline and retrieve via vi.mocked().

const fromMock = vi.fn();

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

vi.mock("../../../_core/docxRender", () => ({
  renderDerivarHojaDocx: vi.fn(),
}));

vi.mock("../../../_core/pdfFromDocxPureNode", () => ({
  renderDerivarHojaPdf: vi.fn(),
  convertDocxToPdfPureNode: vi.fn(),
}));

// Import AFTER vi.mock.
import { renderDerivarHojaDocx } from "../../../_core/docxRender";
import { renderDerivarHojaPdf } from "../../../_core/pdfFromDocxPureNode";
import { pdfGenRouter } from "../pdfGen";

// Typed handles to the mocked functions.
const mockRenderDocx = vi.mocked(renderDerivarHojaDocx);
const mockRenderPdf = vi.mocked(renderDerivarHojaPdf);

// ---------------------------------------------------------------------------
// Context factory
// ---------------------------------------------------------------------------

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctxWithRole(role: AuthenticatedUser["role"]): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: `${role}@bocatas.org`,
    name: "Test Pro",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    logger: new Logger(),
    correlationId: "test-corr",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

// ---------------------------------------------------------------------------
// Fake DB chain helpers
// ---------------------------------------------------------------------------

// UUIDs must be valid RFC 4122 v4 (bits 12-15 = 4, bits 16-17 = 8/9/a/b).
const TEST_HOJA_ID = "12345678-abcd-4abc-8abc-abcdef123456";
const TEST_PROGRAMA_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function singleChain<T>(data: T) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

function listChain<T>(rows: T[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
}

/** Simulate a full set of DB calls for buildTemplateData. */
function setupBuildDataMocks() {
  const fakeHoja = {
    id: TEST_HOJA_ID,
    scope: "persona",
    fecha_apertura: "2026-01-15",
    profesional_nombre: "Ana Martínez",
    persona: { nombre: "Juan", apellidos: "Pérez" },
    familia: null,
    programa: { name: "Comedor" },
  };

  fromMock
    // 1. derivacion_hojas.select.eq.single
    .mockReturnValueOnce(singleChain(fakeHoja))
    // 2. derivacion_intervenciones.select.eq.order → rows
    .mockReturnValueOnce(
      listChain([
        {
          fecha: "2026-02-01",
          tipo_slug: "salud",
          descripcion: "Consulta médica",
          institucion_snapshot: { nombre: "Centro de Salud", direccion: "Calle A", telefono: "910000001" },
          observaciones: null,
        },
      ]),
    )
    // 3. tipos_intervencion.select → tipos
    .mockReturnValueOnce(
      listChain([{ slug: "salud", nombre: "Salud" }]),
    );
}

beforeEach(() => {
  fromMock.mockReset();
  mockRenderDocx.mockReset();
  mockRenderPdf.mockReset();
});

// ─── 1. Role guard ─────────────────────────────────────────────────────────

describe("derivar.generateDocx — role guard", () => {
  it("rejects voluntario with FORBIDDEN", async () => {
    const caller = pdfGenRouter.createCaller({
      user: {
        id: 1,
        openId: "v",
        email: "v@b.org",
        name: "V",
        loginMethod: "manus",
        role: "voluntario",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      logger: new Logger(),
      correlationId: "t",
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    } as TrpcContext);

    await expect(
      caller.generateDocx({ hojaId: TEST_HOJA_ID }),
    ).rejects.toMatchObject({
      name: "TRPCError",
      code: "FORBIDDEN",
    } satisfies Partial<TRPCError>);
    expect(mockRenderDocx).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers with FORBIDDEN", async () => {
    const caller = pdfGenRouter.createCaller({
      user: null,
      logger: new Logger(),
      correlationId: "anon",
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    });

    await expect(
      caller.generateDocx({ hojaId: TEST_HOJA_ID }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<TRPCError>);
  });
});

// ─── 2. generateDocx calls renderDerivarHojaDocx ─────────────────────────

describe("derivar.generateDocx — behavior", () => {
  it("calls renderDerivarHojaDocx with DerivarHojaTemplateData and returns base64", async () => {
    setupBuildDataMocks();
    const fakeDocxBuf = Buffer.from("fake-docx-content");
    mockRenderDocx.mockResolvedValue(fakeDocxBuf);

    const caller = pdfGenRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.generateDocx({ hojaId: TEST_HOJA_ID });

    // renderDerivarHojaDocx was called once
    expect(mockRenderDocx).toHaveBeenCalledTimes(1);

    // The template data passed includes the nombre and programa
    const templateData = mockRenderDocx.mock.calls[0][0] as {
      nombre: string;
      programaReferencia: string;
      profesionalReferencia: string;
      intervenciones: unknown[];
    };
    expect(templateData.nombre).toBe("Juan Pérez");
    expect(templateData.programaReferencia).toBe("Comedor");
    expect(templateData.profesionalReferencia).toBe("Ana Martínez");
    expect(templateData.intervenciones).toHaveLength(1);

    // Returns correct shape
    expect(result.contentBase64).toBe(fakeDocxBuf.toString("base64"));
    expect(result.mime).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(result.filename).toMatch(/^derivacion_hoja_12345678/);
  });
});

// ─── 3. generatePdf calls both render and convert ─────────────────────────

describe("derivar.generatePdf — behavior", () => {
  it("calls renderDerivarHojaPdf directly and returns base64 PDF", async () => {
    setupBuildDataMocks();
    const fakePdfBuf = Buffer.from("fake-pdf");
    mockRenderPdf.mockResolvedValue(fakePdfBuf);

    const caller = pdfGenRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.generatePdf({ hojaId: TEST_HOJA_ID });

    expect(mockRenderPdf).toHaveBeenCalledTimes(1);
    // renderDerivarHojaDocx is NOT called for PDF (PDF uses its own renderer)
    expect(mockRenderDocx).not.toHaveBeenCalled();

    expect(result.contentBase64).toBe(fakePdfBuf.toString("base64"));
    expect(result.mime).toBe("application/pdf");
    expect(result.filename).toMatch(/^derivacion_hoja_12345678.*\.pdf$/);
  });

  it.todo(
    "(integration) renders a known-good buffer when the template is uploaded to the bucket",
  );

  it.todo(
    "(integration) converts a known-good .docx to PDF when libreoffice is available",
  );
});

// ─── 4. previewPdf procedure ──────────────────────────────────────────────

describe("derivar.previewPdf — behavior", () => {
  it("calls renderDerivarHojaPdf and returns base64 PDF with application/pdf mime", async () => {
    setupBuildDataMocks();
    const fakePdfBuf = Buffer.from("%PDF-1.4 fake");
    mockRenderPdf.mockResolvedValue(fakePdfBuf);

    const caller = pdfGenRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.previewPdf({ hojaId: TEST_HOJA_ID });

    expect(mockRenderPdf).toHaveBeenCalledTimes(1);
    expect(result.contentBase64).toBe(fakePdfBuf.toString("base64"));
    expect(result.mime).toBe("application/pdf");
    // previewPdf does NOT return a filename (it's for display only)
    expect(result).not.toHaveProperty("filename");
  });

  it("rejects non-admin callers with FORBIDDEN", async () => {
    const caller = pdfGenRouter.createCaller(ctxWithRole("user"));
    await expect(
      caller.previewPdf({ hojaId: TEST_HOJA_ID }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
