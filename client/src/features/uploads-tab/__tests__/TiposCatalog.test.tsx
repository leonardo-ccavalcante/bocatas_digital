/**
 * Contract-first tests for <TiposCatalog programaId={...} />.
 *
 * Spec source: Phase 1 plan Task 11
 *
 * Iron Law: these tests define the contract. Fix the component, never the test.
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

afterEach(cleanup);

// ── tRPC mock ─────────────────────────────────────────────────────────────────
const { mockListUseQuery, mockSignedUrlFetch } = vi.hoisted(() => ({
  mockListUseQuery: vi.fn(),
  mockSignedUrlFetch: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    programDocumentTypes: {
      list: { useQuery: mockListUseQuery },
      signedUrl: { useQuery: vi.fn() },
    },
    useUtils: () => ({
      programDocumentTypes: {
        signedUrl: { fetch: mockSignedUrlFetch },
      },
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Import AFTER mocks are registered.
import { TiposCatalog } from "../TiposCatalog";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const baseTipo = {
  id: "t1",
  programa_id: "prog1",
  slug: "padron_municipal",
  nombre: "Padrón municipal",
  descripcion: null,
  scope: "familia",
  template_url: null,
  template_filename: null,
  template_version: null,
  guide_url: null,
  guide_filename: null,
  guide_version: null,
  is_required: true,
  is_active: true,
  display_order: 10,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const tipoFamiliaWithTemplate = {
  ...baseTipo,
  template_url: "templates/padron.docx",
  template_filename: "padron.docx",
  template_version: "v1",
};

const tipoFamiliaWithGuide = {
  ...baseTipo,
  guide_url: "guides/padron.pdf",
  guide_filename: "guide-padron.pdf",
  guide_version: "v2",
};

const tipoFamiliaWithBoth = {
  ...tipoFamiliaWithTemplate,
  guide_url: "guides/padron.pdf",
  guide_filename: "guide-padron.pdf",
  guide_version: "v2",
};

const tipoMiembroOptional = {
  ...baseTipo,
  id: "t2",
  slug: "documento_identidad",
  nombre: "Documento de identidad",
  scope: "miembro",
  is_required: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderCatalog(programaId = "prog1") {
  return render(<TiposCatalog programaId={programaId} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("TiposCatalog", () => {
  it("1. renders skeletons while loading", () => {
    mockListUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    renderCatalog();

    // Find all elements that have a skeleton-related class. The Skeleton
    // component from shadcn/ui applies "animate-pulse" and "rounded-md"
    // classes; we look for any element carrying those classes.
    const skeletons = document
      .querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(4);
  });

  it("2. renders empty-state message when data is []", () => {
    mockListUseQuery.mockReturnValue({ data: [], isLoading: false });
    renderCatalog();

    expect(
      screen.getByText(
        "No hay tipos de documento configurados para este programa.",
      ),
    ).toBeInTheDocument();
  });

  it("3. renders title 'Tipos de documento'", () => {
    mockListUseQuery.mockReturnValue({ data: [baseTipo], isLoading: false });
    renderCatalog();

    expect(screen.getByText("Tipos de documento")).toBeInTheDocument();
  });

  it("4. renders one li per active doc-type with the nombre", () => {
    mockListUseQuery.mockReturnValue({
      data: [baseTipo, tipoMiembroOptional],
      isLoading: false,
    });
    renderCatalog();

    const listItems = document.querySelectorAll("li");
    const nombres = Array.from(listItems).map((li) => li.textContent);
    expect(nombres.some((t) => t?.includes("Padrón municipal"))).toBe(true);
    expect(nombres.some((t) => t?.includes("Documento de identidad"))).toBe(
      true,
    );
  });

  it("5. renders 'Por familia' subtitle for scope=familia", () => {
    mockListUseQuery.mockReturnValue({ data: [baseTipo], isLoading: false });
    renderCatalog();

    expect(screen.getByText(/Por familia/)).toBeInTheDocument();
  });

  it("6. renders 'Por miembro' subtitle for scope=miembro", () => {
    mockListUseQuery.mockReturnValue({
      data: [tipoMiembroOptional],
      isLoading: false,
    });
    renderCatalog();

    expect(screen.getByText(/Por miembro/)).toBeInTheDocument();
  });

  it("7. appends ' · Obligatorio' to subtitle when is_required=true", () => {
    mockListUseQuery.mockReturnValue({ data: [baseTipo], isLoading: false });
    renderCatalog();

    expect(screen.getByText(/Obligatorio/)).toBeInTheDocument();
  });

  it("8. omits 'Obligatorio' when is_required=false", () => {
    mockListUseQuery.mockReturnValue({
      data: [tipoMiembroOptional],
      isLoading: false,
    });
    renderCatalog();

    expect(screen.queryByText(/Obligatorio/)).not.toBeInTheDocument();
  });

  it("9. hides Plantilla button when template_url is null", () => {
    mockListUseQuery.mockReturnValue({ data: [baseTipo], isLoading: false });
    renderCatalog();

    expect(
      screen.queryByRole("button", { name: /plantilla/i }),
    ).not.toBeInTheDocument();
  });

  it("10. shows Plantilla button when both template_url and template_filename are present", () => {
    mockListUseQuery.mockReturnValue({
      data: [tipoFamiliaWithTemplate],
      isLoading: false,
    });
    renderCatalog();

    const btn = screen.getByRole("button", {
      name: "Descargar plantilla de Padrón municipal",
    });
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toMatch(/Plantilla/);
  });

  it("11. Plantilla button label includes version when present", () => {
    mockListUseQuery.mockReturnValue({
      data: [tipoFamiliaWithTemplate],
      isLoading: false,
    });
    renderCatalog();

    const btn = screen.getByRole("button", {
      name: "Descargar plantilla de Padrón municipal",
    });
    expect(btn.textContent).toContain("(v1)");
  });

  it("12. hides Guía button when guide_url is null", () => {
    mockListUseQuery.mockReturnValue({ data: [baseTipo], isLoading: false });
    renderCatalog();

    expect(
      screen.queryByRole("button", { name: /guía|guia/i }),
    ).not.toBeInTheDocument();
  });

  it("13. shows Guía button when both guide_url and guide_filename are present", () => {
    mockListUseQuery.mockReturnValue({
      data: [tipoFamiliaWithGuide],
      isLoading: false,
    });
    renderCatalog();

    const btn = screen.getByRole("button", {
      name: "Descargar guía de Padrón municipal",
    });
    expect(btn).toBeInTheDocument();
  });

  it("14. Guía button label includes version when present", () => {
    mockListUseQuery.mockReturnValue({
      data: [tipoFamiliaWithGuide],
      isLoading: false,
    });
    renderCatalog();

    const btn = screen.getByRole("button", {
      name: "Descargar guía de Padrón municipal",
    });
    expect(btn.textContent).toContain("(v2)");
  });

  it("15. a row can render BOTH Plantilla and Guía buttons when both URLs are present", () => {
    mockListUseQuery.mockReturnValue({
      data: [tipoFamiliaWithBoth],
      isLoading: false,
    });
    renderCatalog();

    expect(
      screen.getByRole("button", {
        name: "Descargar plantilla de Padrón municipal",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Descargar guía de Padrón municipal",
      }),
    ).toBeInTheDocument();
  });

  it("16. clicking Plantilla calls signedUrl.fetch with the template path", async () => {
    mockListUseQuery.mockReturnValue({
      data: [tipoFamiliaWithTemplate],
      isLoading: false,
    });
    mockSignedUrlFetch.mockResolvedValue({
      signedUrl: "https://example.com/signed?token=abc",
    });

    renderCatalog();

    await userEvent.click(
      screen.getByRole("button", {
        name: "Descargar plantilla de Padrón municipal",
      }),
    );

    await waitFor(() => {
      expect(mockSignedUrlFetch).toHaveBeenCalledWith({
        path: "templates/padron.docx",
      });
    });
  });

  it("17. clicking Plantilla creates an <a> with download=filename and target=_blank, then clicks it", async () => {
    mockListUseQuery.mockReturnValue({
      data: [tipoFamiliaWithTemplate],
      isLoading: false,
    });
    mockSignedUrlFetch.mockResolvedValue({
      signedUrl: "https://example.com/signed?token=abc",
    });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderCatalog();

    await userEvent.click(
      screen.getByRole("button", {
        name: "Descargar plantilla de Padrón municipal",
      }),
    );

    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalled();
    });

    // Find the anchor that was clicked — it should still be in body briefly,
    // but since .remove() is called immediately we check via the spy's `this`.
    // Instead, verify via the mock return value shape: the anchor was created
    // with the correct attributes before click.
    const lastAnchorClicked = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(lastAnchorClicked.href).toContain("signed?token=abc");
    expect(lastAnchorClicked.download).toBe("padron.docx");
    expect(lastAnchorClicked.target).toBe("_blank");
    expect(lastAnchorClicked.rel).toBe("noopener noreferrer");

    clickSpy.mockRestore();
  });

  it("18. clicking Guía calls signedUrl.fetch with the guide path", async () => {
    mockListUseQuery.mockReturnValue({
      data: [tipoFamiliaWithGuide],
      isLoading: false,
    });
    mockSignedUrlFetch.mockResolvedValue({
      signedUrl: "https://example.com/signed?token=xyz",
    });

    renderCatalog();

    await userEvent.click(
      screen.getByRole("button", {
        name: "Descargar guía de Padrón municipal",
      }),
    );

    await waitFor(() => {
      expect(mockSignedUrlFetch).toHaveBeenCalledWith({
        path: "guides/padron.pdf",
      });
    });
  });

  it("19. signedUrl.fetch error → calls toast.error", async () => {
    mockListUseQuery.mockReturnValue({
      data: [tipoFamiliaWithTemplate],
      isLoading: false,
    });
    mockSignedUrlFetch.mockRejectedValue(new Error("nope"));

    const { toast } = await import("sonner");

    renderCatalog();

    await userEvent.click(
      screen.getByRole("button", {
        name: "Descargar plantilla de Padrón municipal",
      }),
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("nope"),
      );
    });
  });

  it("20. useQuery is enabled only when programaId is truthy", () => {
    mockListUseQuery.mockReturnValue({ data: [], isLoading: false });

    renderCatalog("");

    expect(mockListUseQuery).toHaveBeenCalledWith(
      { programaId: "" },
      expect.objectContaining({ enabled: false }),
    );
  });
});
