/** @vitest-environment jsdom */
/**
 * Tests for SocialReportPanel — pure-logic upload state + rendering integration.
 *
 * Split into two describe blocks:
 *   1. "informe upload state" — pure logic (no DOM), existing cases kept intact.
 *   2. "SocialReportPanel rendering" — render tests added in Task 10.
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// ── jsdom stubs ───────────────────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// ── atob / URL stubs (jsdom does not implement fully) ─────────────────────────
if (typeof global.atob === "undefined") {
  global.atob = () => "";
}
if (typeof URL.createObjectURL === "undefined") {
  URL.createObjectURL = () => "blob:mock";
}
if (typeof URL.revokeObjectURL === "undefined") {
  URL.revokeObjectURL = () => {};
}

// ── tRPC mock ─────────────────────────────────────────────────────────────────
const {
  mockUpdateDocField,
  mockGetLatestFollowUp,
  mockListFollowUps,
  mockCreateFollowUp,
  mockGenerateDocument,
  mockUseUtils,
  mockGetById,
  mockComposeDraft,
  mockUpdateNarrative,
  mockGenerateSocialReport,
} = vi.hoisted(() => ({
  mockUpdateDocField: vi.fn(),
  mockGetLatestFollowUp: vi.fn(),
  mockListFollowUps: vi.fn(),
  mockCreateFollowUp: vi.fn(),
  mockGenerateDocument: vi.fn(),
  mockUseUtils: vi.fn(),
  mockGetById: vi.fn(),
  mockComposeDraft: vi.fn(),
  mockUpdateNarrative: vi.fn(),
  mockGenerateSocialReport: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    families: {
      updateDocField: {
        useMutation: mockUpdateDocField,
      },
      getLatestFollowUp: {
        useQuery: mockGetLatestFollowUp,
      },
      listFollowUps: {
        useQuery: mockListFollowUps,
      },
      createFollowUp: {
        useMutation: mockCreateFollowUp,
      },
      generateDocument: {
        useMutation: mockGenerateDocument,
      },
      // Added in the narrative/persist rewrite (kept in sync with the component):
      getById: {
        useQuery: mockGetById,
      },
      composeNarrativeDraft: {
        useMutation: mockComposeDraft,
      },
      updateNarrative: {
        useMutation: mockUpdateNarrative,
      },
      generateSocialReport: {
        useMutation: mockGenerateSocialReport,
      },
      // DocxPreviewModal is always mounted inside the panel; its query is
      // disabled while closed but useQuery is still invoked on render.
      getSocialReportPdf: {
        useQuery: () => ({ isPending: false, isError: false, data: undefined, error: null }),
      },
    },
    useUtils: mockUseUtils,
  },
}));

// ── dependency mocks ──────────────────────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/features/families/utils/signedUrl", () => ({
  getSignedDocUrl: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/features/families/hooks/useFamilias", () => ({
  useFamilyLevelDocuments: vi.fn().mockReturnValue({ data: [] }),
}));

vi.mock("@/components/DocumentUploadModal", () => ({
  DocumentUploadModal: () => null,
}));

vi.mock("../DocumentPreviewDialog", () => ({
  DocumentPreviewDialog: () => null,
}));

// Import AFTER mocks are registered.
import { SocialReportPanel } from "../SocialReportPanel";
import { useFamilyLevelDocuments } from "@/features/families/hooks/useFamilias";

// ── Helpers ───────────────────────────────────────────────────────────────────
function setupDefaultMocks(options: {
  latestFollowUp?: { id: string; fecha: string; notas?: string } | null;
  followUpRows?: { id: string; family_id: string; fecha: string; notas?: string }[];
  familyDocs?: { documento_tipo: string; documento_url: string | null }[];
  docsLoading?: boolean;
  savedValoracion?: string;
} = {}) {
  const invalidate = vi.fn().mockResolvedValue(undefined);

  mockUseUtils.mockReturnValue({
    families: {
      getById: { invalidate },
      getFamilyDocuments: { invalidate },
      listFollowUps: { invalidate },
      getLatestFollowUp: { invalidate },
    },
  });

  vi.mocked(useFamilyLevelDocuments).mockReturnValue({
    data: options.familyDocs ?? [],
    isLoading: options.docsLoading ?? false,
  } as never);

  mockUpdateDocField.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockGetById.mockReturnValue({
    data: { situacion_familiar_texto: options.savedValoracion ?? "" },
  });
  mockComposeDraft.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockUpdateNarrative.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockGenerateSocialReport.mockReturnValue({ mutate: vi.fn(), isPending: false });

  const latest = options.latestFollowUp !== undefined
    ? options.latestFollowUp
    : { id: "fu1", fecha: "2026-05-15", notas: "Visita domicilio" };

  mockGetLatestFollowUp.mockReturnValue({ data: latest });

  mockListFollowUps.mockReturnValue({
    data: options.followUpRows ?? [],
    isLoading: false,
  });

  mockCreateFollowUp.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockGenerateDocument.mockReturnValue({ mutate: vi.fn(), isPending: false });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Pure-logic upload-state cases live in SocialReportPanel.upload.test.ts —
// this file covers DOM rendering integration only (no duplication).

// ── Rendering integration (Task 10) ───────────────────────────────────────────

describe("SocialReportPanel rendering", () => {
  // T10-1 ─────────────────────────────────────────────────────────────────────
  it("renders a 'Seguimientos' section (FollowUpsPanel present)", () => {
    setupDefaultMocks();
    render(
      <SocialReportPanel
        familyId="fam-1"
        informeSocial={false}
        informeSocialFecha={null}
      />
    );

    // FollowUpsPanel renders an "Añadir seguimiento" button as part of its card
    expect(
      screen.getByRole("button", { name: /añadir seguimiento/i }),
    ).toBeInTheDocument();
  });

  // T10-2 ─────────────────────────────────────────────────────────────────────
  it("renders a 'Generar informe social' button", () => {
    setupDefaultMocks();
    render(
      <SocialReportPanel
        familyId="fam-1"
        informeSocial={false}
        informeSocialFecha={null}
      />
    );

    expect(
      screen.getByRole("button", { name: /generar y guardar el informe/i }),
    ).toBeInTheDocument();
  });

  // T10-3 (rewritten for ADR-0014: first informe requires no seguimiento) ─────
  it("first informe: no follow-ups + no informe docs + saved valoración → button ENABLED, no alert", () => {
    setupDefaultMocks({ latestFollowUp: null, familyDocs: [], savedValoracion: "Situación." });
    render(
      <SocialReportPanel familyId="fam-1" informeSocial={false} informeSocialFecha={null} />
    );

    const btn = screen.getByRole("button", { name: /generar y guardar el informe/i });
    expect(btn).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("first informe: still blocked by the missing valoración (message shown)", () => {
    setupDefaultMocks({ latestFollowUp: null, familyDocs: [], savedValoracion: "" });
    render(
      <SocialReportPanel familyId="fam-1" informeSocial={false} informeSocialFecha={null} />
    );

    expect(screen.getByRole("button", { name: /generar y guardar el informe/i })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Añade la valoración social (Descripción de la situación familiar) antes de generar.",
    );
  });

  it("first informe: a stale follow-up on record does not block generation", () => {
    setupDefaultMocks({
      latestFollowUp: { id: "fu-old", fecha: "2024-01-01" },
      familyDocs: [],
      savedValoracion: "Situación.",
    });
    render(
      <SocialReportPanel familyId="fam-1" informeSocial={false} informeSocialFecha={null} />
    );

    expect(screen.getByRole("button", { name: /generar y guardar el informe/i })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renovación (generated informe exists): no follow-ups → disabled with the seguimiento alert", () => {
    setupDefaultMocks({
      latestFollowUp: null,
      familyDocs: [{ documento_tipo: "informe_valoracion_social", documento_url: "fam-1/-1/informe.docx" }],
      savedValoracion: "Situación.",
    });
    render(
      <SocialReportPanel familyId="fam-1" informeSocial={true} informeSocialFecha="2026-07-01" />
    );

    expect(screen.getByRole("button", { name: /generar y guardar el informe/i })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Sin seguimientos registrados. Añade un seguimiento para habilitar la generación.",
    );
  });

  it("renovación (uploaded PDF only): counts as prior informe → seguimiento required", () => {
    setupDefaultMocks({
      latestFollowUp: null,
      familyDocs: [{ documento_tipo: "informe_social", documento_url: "fam-1/-1/informe.pdf" }],
      savedValoracion: "Situación.",
    });
    render(
      <SocialReportPanel familyId="fam-1" informeSocial={true} informeSocialFecha="2026-07-01" />
    );

    expect(screen.getByRole("button", { name: /generar y guardar el informe/i })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Sin seguimientos registrados. Añade un seguimiento para habilitar la generación.",
    );
  });

  it("manual informe_social flag with NO document row does not count as prior informe", () => {
    // The «Actualizar» flow can set informe_social=true with no document behind
    // it — that must not lock a family out of its first informe (ADR-0014).
    setupDefaultMocks({ latestFollowUp: null, familyDocs: [], savedValoracion: "Situación." });
    render(
      <SocialReportPanel familyId="fam-1" informeSocial={true} informeSocialFecha="2026-07-01" />
    );

    expect(screen.getByRole("button", { name: /generar y guardar el informe/i })).toBeEnabled();
  });

  it("while the documents query is loading, the generate button stays disabled (no enabled flash)", () => {
    setupDefaultMocks({
      latestFollowUp: null,
      familyDocs: [],
      docsLoading: true,
      savedValoracion: "Situación.",
    });
    render(
      <SocialReportPanel familyId="fam-1" informeSocial={false} informeSocialFecha={null} />
    );

    expect(screen.getByRole("button", { name: /generar y guardar el informe/i })).toBeDisabled();
  });
});
