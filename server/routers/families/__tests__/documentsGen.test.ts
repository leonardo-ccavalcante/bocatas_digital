/**
 * documentsGen.test.ts — families.generateDocument
 *
 * Mock strategy:
 * - documentService: vi.mock with a factory that uses vi.importActual to get
 *   the REAL DocumentValidationError class so instanceof checks work in the
 *   procedure under test.
 * - documentContextBuilder: vi.mock with a simple vi.fn() stub.
 * - createAdminClient: same chainable-Supabase mock idiom as followUps.test.ts.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

import type { TrpcContext } from "../../../_core/context";
import { Logger } from "../../../_core/logger";

// ─── vi.mock — must precede all imports ──────────────────────────────────────

const fromMock = vi.fn();

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

// Mock documentContextBuilder with a simple stub.
vi.mock("../../../services/documentContextBuilder", () => ({
  buildFamilyDataContext: vi.fn(),
}));

// Mock documentService: renderDocument is a vi.fn(), but DocumentValidationError
// is the REAL class (via vi.importActual) so instanceof checks in the router work.
vi.mock("../../../services/documentService", async () => {
  const actual = await vi.importActual<typeof import("../../../services/documentService")>(
    "../../../services/documentService"
  );
  return {
    ...actual,
    renderDocument: vi.fn(),
  };
});

// ─── Import after vi.mock ─────────────────────────────────────────────────────

import { documentsGenRouter } from "../documents-gen";
import { buildFamilyDataContext } from "../../../services/documentContextBuilder";
import { renderDocument, DocumentValidationError } from "../../../services/documentService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctxWithRole(role: AuthenticatedUser["role"]): TrpcContext {
  const user: AuthenticatedUser = {
    id: 42,
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
    correlationId: "docs-gen-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const FAMILY_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SESSION_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

// Minimal FamilyDocumentContext shape for mocking (only fields used by the procedure).
const MOCK_CONTEXT = {
  titular: { nombre: "Ana", apellidos: "García", documento: "X1234567A", telefono: "600000001" },
  familia: {
    numero: "0001",
    num_adultos: 2,
    num_menores_18: 1,
    total_miembros: 3,
    distrito: null,
    codigo_postal: null,
    estado: "activo",
  },
  miembros: [],
  logos: [],
  static_blocks: {},
  generated_at: new Date().toISOString(),
  generated_by_name: "",
};

beforeEach(() => {
  fromMock.mockReset();
  vi.mocked(buildFamilyDataContext).mockReset();
  vi.mocked(renderDocument).mockReset();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("families.generateDocument", () => {
  it("success — returns bufferBase64, fileName, and mime", async () => {
    vi.mocked(buildFamilyDataContext).mockResolvedValueOnce(MOCK_CONTEXT as never);

    const fakeBuffer = Buffer.from("fake-docx-content");
    vi.mocked(renderDocument).mockResolvedValueOnce({
      buffer: fakeBuffer,
      fileName: "informe-social-F0001-2026-05-21.docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const caller = documentsGenRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.generateDocument({
      family_id: FAMILY_ID,
      slug: "derivacion",
    });

    expect(result.bufferBase64).toBe(fakeBuffer.toString("base64"));
    expect(result.fileName).toBe("informe-social-F0001-2026-05-21.docx");
    expect(result.mime).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    expect(buildFamilyDataContext).toHaveBeenCalledWith(
      expect.objectContaining({ from: fromMock }),
      FAMILY_ID,
      expect.objectContaining({ slug: "derivacion" })
    );

    expect(renderDocument).toHaveBeenCalledWith(
      "derivacion",
      MOCK_CONTEXT,
      expect.objectContaining({ actorId: "42", familyId: FAMILY_ID })
    );
  });

  it("rejects slug informe_social — informes must go through generateSocialReport (ADR-0014)", async () => {
    const caller = documentsGenRouter.createCaller(ctxWithRole("admin"));
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      caller.generateDocument({ family_id: FAMILY_ID, slug: "informe_social" as any })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(renderDocument).not.toHaveBeenCalled();
  });

  it("nota_entrega with session_id — passes session_id to buildFamilyDataContext", async () => {
    vi.mocked(buildFamilyDataContext).mockResolvedValueOnce(MOCK_CONTEXT as never);

    const fakeBuffer = Buffer.from("nota-content");
    vi.mocked(renderDocument).mockResolvedValueOnce({
      buffer: fakeBuffer,
      fileName: "nota-entrega-F0001-2026-05-21.docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const caller = documentsGenRouter.createCaller(ctxWithRole("admin"));
    await caller.generateDocument({
      family_id: FAMILY_ID,
      slug: "nota_entrega",
      session_id: SESSION_ID,
    });

    expect(buildFamilyDataContext).toHaveBeenCalledWith(
      expect.anything(),
      FAMILY_ID,
      expect.objectContaining({ slug: "nota_entrega", programSessionId: SESSION_ID })
    );
  });

  it("DocumentValidationError from renderDocument → TRPCError BAD_REQUEST with the message", async () => {
    vi.mocked(buildFamilyDataContext).mockResolvedValueOnce(MOCK_CONTEXT as never);

    const validationError = new DocumentValidationError(
      "STALE_INFORME",
      "El informe social está vencido (último seguimiento: 2024-01-01). Registra un seguimiento reciente antes de generar."
    );
    vi.mocked(renderDocument).mockRejectedValueOnce(validationError);

    const caller = documentsGenRouter.createCaller(ctxWithRole("admin"));
    await expect(
      caller.generateDocument({ family_id: FAMILY_ID, slug: "derivacion" })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: validationError.message,
    });
  });

  it("non-TRPCError from buildFamilyDataContext → TRPCError NOT_FOUND", async () => {
    vi.mocked(buildFamilyDataContext).mockRejectedValueOnce(new Error("DB connection failed"));

    const caller = documentsGenRouter.createCaller(ctxWithRole("admin"));
    await expect(
      caller.generateDocument({ family_id: FAMILY_ID, slug: "derivacion" })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Familia no encontrada",
    });
  });

  it("TRPCError from buildFamilyDataContext is re-thrown as-is", async () => {
    const { TRPCError } = await import("@trpc/server");
    const trpcErr = new TRPCError({ code: "BAD_REQUEST", message: "programSessionId es obligatorio para nota_entrega" });
    vi.mocked(buildFamilyDataContext).mockRejectedValueOnce(trpcErr);

    const caller = documentsGenRouter.createCaller(ctxWithRole("admin"));
    await expect(
      caller.generateDocument({ family_id: FAMILY_ID, slug: "nota_entrega" })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "programSessionId es obligatorio para nota_entrega",
    });
  });

  it("unexpected error from renderDocument → TRPCError INTERNAL_SERVER_ERROR", async () => {
    vi.mocked(buildFamilyDataContext).mockResolvedValueOnce(MOCK_CONTEXT as never);
    vi.mocked(renderDocument).mockRejectedValueOnce(new Error("Unexpected crash"));

    const caller = documentsGenRouter.createCaller(ctxWithRole("admin"));
    await expect(
      caller.generateDocument({ family_id: FAMILY_ID, slug: "derivacion" })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Error inesperado al generar el documento",
    });
  });
});
