/**
 * Contract-first tests for <ArchiveExplorer programaId onReclassify />.
 *
 * Spec source: Phase 1 plan Task 13b
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

// ── Hoisted mock factories ────────────────────────────────────────────────────
const {
  mockListAllForProgramUseQuery,
  mockDocTypesUseQuery,
  mockGetSignedDocUrl,
} = vi.hoisted(() => ({
  mockListAllForProgramUseQuery: vi.fn(),
  mockDocTypesUseQuery: vi.fn(),
  mockGetSignedDocUrl: vi.fn(),
}));

// ── tRPC mock ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/trpc", () => ({
  trpc: {
    families: {
      listAllForProgram: { useQuery: mockListAllForProgramUseQuery },
    },
    programDocumentTypes: {
      list: { useQuery: mockDocTypesUseQuery },
    },
  },
}));

vi.mock("@/features/families/utils/signedUrl", () => ({
  getSignedDocUrl: mockGetSignedDocUrl,
}));

// Alias for the @/ path as both forms may appear in imports
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: { from: vi.fn(() => ({ createSignedUrl: vi.fn() })) },
  }),
}));

// Import AFTER mocks are registered.
import { ArchiveExplorer } from "../ArchiveExplorer";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const TIPO_PADRON = {
  id: "t1",
  slug: "padron_municipal",
  nombre: "Padrón municipal",
  scope: "familia",
  is_required: true,
};

const makeRow = (overrides: Partial<DocRow> = {}): DocRow => ({
  id: "d1",
  documento_tipo: "padron_municipal",
  family_id: "f1",
  member_index: -1,
  documento_url: "f1/-1/padron_municipal/12345.pdf",
  fecha_upload: null,
  created_at: "2026-04-01T10:00:00Z",
  families: {
    familia_numero: 42,
    persons: { nombre: "Ana", apellidos: "García" },
  },
  ...overrides,
});

interface DocRow {
  id: string;
  documento_tipo: string;
  family_id: string;
  member_index: number;
  documento_url: string;
  fecha_upload: string | null;
  created_at: string;
  families: {
    familia_numero: number;
    persons: { nombre: string; apellidos: string };
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderExplorer(props: {
  programaId?: string;
  onReclassify?: (docId: string, currentTipo: string) => void;
} = {}) {
  const onReclassify = props.onReclassify ?? vi.fn();
  const programaId = props.programaId ?? "prog-1";
  return {
    onReclassify,
    ...render(<ArchiveExplorer programaId={programaId} onReclassify={onReclassify} />),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("ArchiveExplorer", () => {
  it("1. renders 'Archivo' title", () => {
    mockListAllForProgramUseQuery.mockReturnValue({ data: { rows: [], total: 0 }, isLoading: false });
    mockDocTypesUseQuery.mockReturnValue({ data: [], isLoading: false });
    renderExplorer();
    expect(screen.getByText("Archivo")).toBeInTheDocument();
  });

  it("2. renders skeletons while loading", () => {
    mockListAllForProgramUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    mockDocTypesUseQuery.mockReturnValue({ data: [], isLoading: false });
    renderExplorer();
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(6);
  });

  it("3. renders empty-state row when data.rows is []", () => {
    mockListAllForProgramUseQuery.mockReturnValue({ data: { rows: [], total: 0 }, isLoading: false });
    mockDocTypesUseQuery.mockReturnValue({ data: [], isLoading: false });
    renderExplorer();
    expect(screen.getByText("Sin documentos en el archivo")).toBeInTheDocument();
  });

  it("4. renders one table row per document", () => {
    const row1 = makeRow({ id: "d1", families: { familia_numero: 42, persons: { nombre: "Ana", apellidos: "García" } } });
    const row2 = makeRow({ id: "d2", families: { familia_numero: 99, persons: { nombre: "Juan", apellidos: "López" } } });
    mockListAllForProgramUseQuery.mockReturnValue({ data: { rows: [row1, row2], total: 2 }, isLoading: false });
    mockDocTypesUseQuery.mockReturnValue({ data: [TIPO_PADRON], isLoading: false });
    renderExplorer();
    expect(screen.getByText(/#42/)).toBeInTheDocument();
    expect(screen.getByText(/#99/)).toBeInTheDocument();
    expect(screen.getByText(/Ana García/)).toBeInTheDocument();
    expect(screen.getByText(/Juan López/)).toBeInTheDocument();
  });

  it("5. looks up tipo slug → nombre via useProgramDocumentTypes", () => {
    const row = makeRow({ documento_tipo: "padron_municipal" });
    mockListAllForProgramUseQuery.mockReturnValue({ data: { rows: [row], total: 1 }, isLoading: false });
    mockDocTypesUseQuery.mockReturnValue({ data: [TIPO_PADRON], isLoading: false });
    renderExplorer();
    expect(screen.getByText("Padrón municipal")).toBeInTheDocument();
  });

  it("6. falls back to slug when no matching type is in the registry", () => {
    const row = makeRow({ documento_tipo: "unknown_slug" });
    mockListAllForProgramUseQuery.mockReturnValue({ data: { rows: [row], total: 1 }, isLoading: false });
    mockDocTypesUseQuery.mockReturnValue({ data: [TIPO_PADRON], isLoading: false });
    renderExplorer();
    expect(screen.getByText("unknown_slug")).toBeInTheDocument();
  });

  it("7. formats fecha (created_at) as Spanish date", () => {
    const row = makeRow({ created_at: "2026-04-01T10:00:00Z" });
    mockListAllForProgramUseQuery.mockReturnValue({ data: { rows: [row], total: 1 }, isLoading: false });
    mockDocTypesUseQuery.mockReturnValue({ data: [TIPO_PADRON], isLoading: false });
    renderExplorer();
    // toLocaleDateString("es-ES") on 2026-04-01 → "1/4/2026"
    const dateStr = new Date("2026-04-01T10:00:00Z").toLocaleDateString("es-ES");
    expect(screen.getByText(dateStr)).toBeInTheDocument();
  });

  it("8. clicking 'Ver' calls getSignedDocUrl and window.open", async () => {
    const row = makeRow();
    mockListAllForProgramUseQuery.mockReturnValue({ data: { rows: [row], total: 1 }, isLoading: false });
    mockDocTypesUseQuery.mockReturnValue({ data: [TIPO_PADRON], isLoading: false });
    mockGetSignedDocUrl.mockResolvedValue("https://signed.example/foo");
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    renderExplorer();
    await userEvent.click(screen.getByRole("button", { name: /ver/i }));

    await waitFor(() => {
      expect(mockGetSignedDocUrl).toHaveBeenCalledWith(row.documento_url);
      expect(openSpy).toHaveBeenCalledWith("https://signed.example/foo", "_blank");
    });

    openSpy.mockRestore();
  });

  it("9. clicking 'Reclasificar' fires onReclassify with (docId, currentTipo)", async () => {
    const row = makeRow({ id: "d1", documento_tipo: "padron_municipal" });
    mockListAllForProgramUseQuery.mockReturnValue({ data: { rows: [row], total: 1 }, isLoading: false });
    mockDocTypesUseQuery.mockReturnValue({ data: [TIPO_PADRON], isLoading: false });
    const onReclassify = vi.fn();

    renderExplorer({ onReclassify });
    await userEvent.click(screen.getByRole("button", { name: /reclasificar/i }));

    expect(onReclassify).toHaveBeenCalledWith("d1", "padron_municipal");
  });

  it("10. tipo filter passes the selected slug to useQuery", async () => {
    mockListAllForProgramUseQuery.mockReturnValue({ data: { rows: [], total: 0 }, isLoading: false });
    mockDocTypesUseQuery.mockReturnValue({ data: [TIPO_PADRON], isLoading: false });

    renderExplorer();

    const trigger = screen.getByRole("combobox", { name: /filtrar por tipo/i });
    await userEvent.click(trigger);
    const option = await screen.findByText("Padrón municipal");
    await userEvent.click(option);

    await waitFor(() => {
      expect(mockListAllForProgramUseQuery).toHaveBeenCalledWith(
        expect.objectContaining({ tipoSlug: "padron_municipal", limit: 50, offset: 0 }),
        expect.anything()
      );
    });
  });

  it("11. 'Todos los tipos' option clears the tipoSlug filter", async () => {
    mockListAllForProgramUseQuery.mockReturnValue({ data: { rows: [], total: 0 }, isLoading: false });
    mockDocTypesUseQuery.mockReturnValue({ data: [TIPO_PADRON], isLoading: false });

    renderExplorer();

    // First select a tipo
    const trigger = screen.getByRole("combobox", { name: /filtrar por tipo/i });
    await userEvent.click(trigger);
    const tipoOption = await screen.findByText("Padrón municipal");
    await userEvent.click(tipoOption);

    // Now pick "Todos los tipos"
    await userEvent.click(trigger);
    const allOption = await screen.findByText("Todos los tipos");
    await userEvent.click(allOption);

    await waitFor(() => {
      // Last call should have tipoSlug: undefined
      const calls = mockListAllForProgramUseQuery.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toMatchObject({ limit: 50, offset: 0 });
      expect(lastCall[0].tipoSlug).toBeUndefined();
    });
  });

  it("12. total count is rendered below the table", () => {
    const rows = [makeRow({ id: "d1" }), makeRow({ id: "d2" })];
    mockListAllForProgramUseQuery.mockReturnValue({ data: { rows, total: 42 }, isLoading: false });
    mockDocTypesUseQuery.mockReturnValue({ data: [TIPO_PADRON], isLoading: false });
    renderExplorer();
    expect(screen.getByText(/42 documentos/)).toBeInTheDocument();
  });

  it("13. table has aria-label=\"Archivo de documentos\"", () => {
    mockListAllForProgramUseQuery.mockReturnValue({ data: { rows: [], total: 0 }, isLoading: false });
    mockDocTypesUseQuery.mockReturnValue({ data: [], isLoading: false });
    renderExplorer();
    expect(screen.getByRole("table", { name: "Archivo de documentos" })).toBeInTheDocument();
  });

  it("14. tipo select has aria-label=\"Filtrar por tipo\"", () => {
    mockListAllForProgramUseQuery.mockReturnValue({ data: { rows: [], total: 0 }, isLoading: false });
    mockDocTypesUseQuery.mockReturnValue({ data: [], isLoading: false });
    renderExplorer();
    expect(screen.getByRole("combobox", { name: "Filtrar por tipo" })).toBeInTheDocument();
  });
});
