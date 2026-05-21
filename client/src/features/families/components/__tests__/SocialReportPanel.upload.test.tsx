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
} = vi.hoisted(() => ({
  mockUpdateDocField: vi.fn(),
  mockGetLatestFollowUp: vi.fn(),
  mockListFollowUps: vi.fn(),
  mockCreateFollowUp: vi.fn(),
  mockGenerateDocument: vi.fn(),
  mockUseUtils: vi.fn(),
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function setupDefaultMocks(options: {
  latestFollowUp?: { id: string; fecha: string; notas?: string } | null;
  followUpRows?: { id: string; family_id: string; fecha: string; notas?: string }[];
} = {}) {
  const invalidate = vi.fn().mockResolvedValue(undefined);

  mockUseUtils.mockReturnValue({
    families: {
      getById: { invalidate },
      listFollowUps: { invalidate },
      getLatestFollowUp: { invalidate },
    },
  });

  mockUpdateDocField.mockReturnValue({ mutate: vi.fn(), isPending: false });

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

// ── Block 1: pure-logic upload state (EXISTING — do not remove) ───────────────

type DocRow = {
  documento_tipo: string;
  documento_url: string | null;
  is_current?: boolean;
  deleted_at?: string | null;
};

function findInformeSocialRow(familyDocs: DocRow[]): DocRow | undefined {
  return familyDocs.find(
    (d) => d.documento_tipo === "informe_social" && !!d.documento_url
  );
}

describe("SocialReportPanel — informe upload state", () => {
  it("shows no Ver-informe link when no PDF uploaded", () => {
    expect(findInformeSocialRow([])).toBeUndefined();
  });

  it("shows Ver-informe link when a PDF is uploaded", () => {
    const docs: DocRow[] = [
      {
        documento_tipo: "informe_social",
        documento_url: "https://supabase/informe.pdf",
      },
    ];
    const row = findInformeSocialRow(docs);
    expect(row).toBeDefined();
    expect(row!.documento_url).toContain("informe.pdf");
  });

  it("ignores placeholder rows (documento_url=null)", () => {
    const docs: DocRow[] = [
      { documento_tipo: "informe_social", documento_url: null },
    ];
    expect(findInformeSocialRow(docs)).toBeUndefined();
  });

  it("ignores other doc types", () => {
    const docs: DocRow[] = [
      { documento_tipo: "padron_municipal", documento_url: "https://x" },
    ];
    expect(findInformeSocialRow(docs)).toBeUndefined();
  });

  it("supports flexible insertion (date OR upload — both paths coexist)", () => {
    // Date-only path: family.informe_social_fecha is set, but no upload yet.
    // Upload path: a row exists in family_member_documents with documento_url.
    // Both are tracked independently.
    const docs: DocRow[] = []; // no upload yet
    const dateOnlyState = { informe_social: true, informe_social_fecha: "2026-04-15" };
    expect(findInformeSocialRow(docs)).toBeUndefined();
    expect(dateOnlyState.informe_social).toBe(true);
  });
});

// ── Block 2: rendering integration (NEW — Task 10) ────────────────────────────

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
      screen.getByRole("button", { name: /generar informe social/i }),
    ).toBeInTheDocument();
  });

  // T10-3 ─────────────────────────────────────────────────────────────────────
  it("when getLatestFollowUp returns null, GenerateDocumentButton is disabled and blocking error is visible", () => {
    setupDefaultMocks({ latestFollowUp: null });
    render(
      <SocialReportPanel
        familyId="fam-1"
        informeSocial={false}
        informeSocialFecha={null}
      />
    );

    const btn = screen.getByRole("button", { name: /generar informe social/i });
    expect(btn).toBeDisabled();

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(
      "Sin seguimientos registrados. Añade un seguimiento para habilitar la generación.",
    );
  });
});
