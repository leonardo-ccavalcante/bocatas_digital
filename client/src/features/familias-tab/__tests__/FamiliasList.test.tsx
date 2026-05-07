/**
 * Contract-first tests for <FamiliasList onRowClick={...} />.
 *
 * Spec source: CLAUDE.md Phase 1 Task 7 + Task 8 a11y
 *
 * Iron Law: these tests define the contract. Fix the component, never the test.
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ── jsdom stubs ───────────────────────────────────────────────────────────────
// ResizeObserver is used by Radix UI components; jsdom doesn't provide it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

// Radix UI Select uses hasPointerCapture / setPointerCapture and scrollIntoView;
// jsdom doesn't implement them.
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

// ── tRPC mock ─────────────────────────────────────────────────────────────────
// vi.mock factories are hoisted to the top of the file, so we must use
// vi.hoisted() to declare the mock fn before the hoisting boundary.
const { mockUseQuery } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    families: {
      getAll: {
        useQuery: mockUseQuery,
      },
    },
  },
}));

// Import AFTER mocks are registered.
import { FamiliasList } from "../FamiliasList";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const sampleRows = [
  {
    id: "f1",
    familia_numero: 42,
    estado: "activa",
    num_adultos: 2,
    num_menores_18: 3,
    informe_social: true,
    alta_en_guf: true,
    persons: { nombre: "Ana", apellidos: "García López" },
  },
  {
    id: "f2",
    familia_numero: 43,
    estado: "activa",
    num_adultos: 1,
    num_menores_18: 0,
    informe_social: false,
    alta_en_guf: false,
    persons: { nombre: "Bilal", apellidos: "Mansour" },
  },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * Render with an in-memory wouter router (URL state stays isolated per test).
 * Returns the loc handle so callers can inspect the history.
 */
function renderWithMemory(
  ui: React.ReactElement,
  { searchPath = "" }: { searchPath?: string } = {},
) {
  const loc = memoryLocation({ path: "/", searchPath, record: true });
  const result = render(
    <Router hook={loc.hook} searchHook={loc.searchHook}>
      {ui}
    </Router>,
  );
  return { ...result, loc };
}

/**
 * Render with the default wouter browser location hook so that navigate() calls
 * actually update window.location (jsdom's window). Use this for tests that need
 * to assert on window.location.search.
 */
function renderWithBrowserLocation(
  ui: React.ReactElement,
  { path = "/" }: { path?: string } = {},
) {
  window.history.replaceState({}, "", path);
  return render(<Router>{ui}</Router>);
}

// RTL does not auto-cleanup without `globals: true` in vitest.config.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // Reset jsdom location so tests don't bleed into each other
  window.history.replaceState({}, "", "/");
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FamiliasList contract", () => {
  const noop = () => {};

  // 1 ──────────────────────────────────────────────────────────────────────────
  it("renders skeletons while loading", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });

    renderWithMemory(<FamiliasList onRowClick={noop} />);

    // The component renders 8 <Skeleton> divs inside a .space-y-2 container when
    // isLoading=true; there is no <table> in this state.
    const skeletonContainer = document.querySelector(".space-y-2");
    expect(skeletonContainer).not.toBeNull();
    expect(skeletonContainer!.children).toHaveLength(8);
  });

  // 2 ──────────────────────────────────────────────────────────────────────────
  it("renders empty-state row when query resolves to []", () => {
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });

    renderWithMemory(<FamiliasList onRowClick={noop} />);

    expect(screen.getByText(/sin resultados/i)).toBeInTheDocument();
  });

  // 3 ──────────────────────────────────────────────────────────────────────────
  it("renders one row per family with correct columns", () => {
    mockUseQuery.mockReturnValue({ data: sampleRows, isLoading: false });

    renderWithMemory(<FamiliasList onRowClick={noop} />);

    // NOTE: data <tr> elements have role="button" explicitly set, which overrides
    // the implicit ARIA role="row". So getAllByRole("button") finds family rows.
    // We filter by aria-label to exclude the toggle buttons in the filter bar.
    const familyRows = screen
      .getAllByRole("button")
      .filter((el) => el.getAttribute("aria-label")?.startsWith("Abrir detalle"));

    expect(familyRows).toHaveLength(2);

    // First row: #42, Ana García López, 5 members, Activa
    expect(familyRows[0]).toHaveTextContent("42");
    expect(familyRows[0]).toHaveTextContent("Ana García López");
    expect(familyRows[0]).toHaveTextContent("5");
    expect(familyRows[0]).toHaveTextContent("Activa");

    // Second row: #43, Bilal Mansour, 1 member, Pendiente (informe_social=false)
    expect(familyRows[1]).toHaveTextContent("43");
    expect(familyRows[1]).toHaveTextContent("Bilal Mansour");
    expect(familyRows[1]).toHaveTextContent("1");
    expect(familyRows[1]).toHaveTextContent("Pendiente");
  });

  // 4 ──────────────────────────────────────────────────────────────────────────
  it("shows AlertTriangle for rows with sinGuf or sinInforme", () => {
    mockUseQuery.mockReturnValue({ data: sampleRows, isLoading: false });

    renderWithMemory(<FamiliasList onRowClick={noop} />);

    const familyRows = screen
      .getAllByRole("button")
      .filter((el) => el.getAttribute("aria-label")?.startsWith("Abrir detalle"));

    expect(familyRows).toHaveLength(2);

    // Second row (f2) has both alta_en_guf=false and informe_social=false
    const alertInRow2 = familyRows[1].querySelector('[aria-label="Atención requerida"]');
    expect(alertInRow2).not.toBeNull();

    // First row (f1) has both=true — no alert
    const alertInRow1 = familyRows[0].querySelector('[aria-label="Atención requerida"]');
    expect(alertInRow1).toBeNull();
  });

  // 5 ──────────────────────────────────────────────────────────────────────────
  it("each row is keyboard-accessible (tabIndex=0, role=button)", () => {
    mockUseQuery.mockReturnValue({ data: sampleRows, isLoading: false });

    renderWithMemory(<FamiliasList onRowClick={noop} />);

    const familyRows = screen
      .getAllByRole("button")
      .filter((el) => el.getAttribute("aria-label")?.startsWith("Abrir detalle"));

    expect(familyRows).toHaveLength(2);
    for (const row of familyRows) {
      expect(row).toHaveAttribute("tabindex", "0");
    }
  });

  // 6 ──────────────────────────────────────────────────────────────────────────
  it('row aria-label includes "#42" when familia_numero=42', () => {
    mockUseQuery.mockReturnValue({ data: sampleRows, isLoading: false });

    renderWithMemory(<FamiliasList onRowClick={noop} />);

    const row = screen.getByRole("button", { name: "Abrir detalle de familia #42" });
    expect(row).toBeInTheDocument();
  });

  // 7 ──────────────────────────────────────────────────────────────────────────
  it('row aria-label omits "#" when familia_numero is null', () => {
    const rowWithNullNumero = [
      {
        ...sampleRows[0],
        id: "f-null",
        familia_numero: null,
      },
    ];
    mockUseQuery.mockReturnValue({ data: rowWithNullNumero, isLoading: false });

    renderWithMemory(<FamiliasList onRowClick={noop} />);

    // Should NOT contain "#" anywhere in the aria-label
    const row = screen.getByRole("button", { name: "Abrir detalle de familia" });
    expect(row).toBeInTheDocument();
    expect(row.getAttribute("aria-label")).not.toContain("#");
  });

  // 8 ──────────────────────────────────────────────────────────────────────────
  it("pressing Enter on a focused row fires onRowClick(f.id)", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    mockUseQuery.mockReturnValue({ data: sampleRows, isLoading: false });

    renderWithMemory(<FamiliasList onRowClick={onRowClick} />);

    const firstRow = screen.getByRole("button", { name: "Abrir detalle de familia #42" });
    firstRow.focus();
    await user.keyboard("{Enter}");

    expect(onRowClick).toHaveBeenCalledWith("f1");
  });

  // 9 ──────────────────────────────────────────────────────────────────────────
  it("pressing Space on a focused row fires onRowClick(f.id)", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    mockUseQuery.mockReturnValue({ data: sampleRows, isLoading: false });

    renderWithMemory(<FamiliasList onRowClick={onRowClick} />);

    const firstRow = screen.getByRole("button", { name: "Abrir detalle de familia #42" });
    firstRow.focus();
    await user.keyboard("{ }");

    expect(onRowClick).toHaveBeenCalledWith("f1");
  });

  // 10 ─────────────────────────────────────────────────────────────────────────
  it("clicking a row fires onRowClick(f.id)", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    mockUseQuery.mockReturnValue({ data: sampleRows, isLoading: false });

    renderWithMemory(<FamiliasList onRowClick={onRowClick} />);

    const firstRow = screen.getByRole("button", { name: "Abrir detalle de familia #42" });
    await user.click(firstRow);

    expect(onRowClick).toHaveBeenCalledWith("f1");
  });

  // 11 ─────────────────────────────────────────────────────────────────────────
  it('table has aria-label="Lista de familias"', () => {
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });

    renderWithMemory(<FamiliasList onRowClick={noop} />);

    expect(
      screen.getByRole("table", { name: /lista de familias/i }),
    ).toBeInTheDocument();
  });

  // 12 ─────────────────────────────────────────────────────────────────────────
  it("typing in the search box and pressing Enter commits the new search to the URL", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });

    // Use browser location so navigate() updates window.location
    renderWithBrowserLocation(<FamiliasList onRowClick={noop} />, { path: "/?tab=familias" });

    const searchInput = screen.getByRole("textbox", { name: /buscar familia/i });
    await user.click(searchInput);
    await user.type(searchInput, "García");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(window.location.search).toContain("search=Garc");
    });
  });

  // 13 ─────────────────────────────────────────────────────────────────────────
  it("blurring the search box commits the search", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });

    renderWithBrowserLocation(<FamiliasList onRowClick={noop} />, { path: "/?tab=familias" });

    const searchInput = screen.getByRole("textbox", { name: /buscar familia/i });
    await user.click(searchInput);
    await user.type(searchInput, "Bilal");
    await user.tab(); // blur the input

    await waitFor(() => {
      expect(window.location.search).toContain("search=Bilal");
    });
  });

  // 14 ─────────────────────────────────────────────────────────────────────────
  it('switching the estado dropdown to "En baja" updates the URL to estado=baja', async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });

    renderWithBrowserLocation(<FamiliasList onRowClick={noop} />, { path: "/?tab=familias" });

    // The estado filter is a Radix <Select> (role="combobox").
    // Radix Select is notoriously hard to drive with userEvent in jsdom because:
    //   1. It uses pointer capture APIs (stubbed above)
    //   2. It sets pointer-events:none on <body> while open
    //   3. Its item selection uses onPointerUp internally
    // Strategy: open with fireEvent (bypasses pointer-events check), then select
    // the option by firing the events Radix listens for on the item.
    const estadoTrigger = screen.getByRole("combobox", { name: /filtrar por estado/i });

    fireEvent.pointerDown(estadoTrigger, { button: 0, ctrlKey: false });
    fireEvent.click(estadoTrigger);

    // Radix renders options in a portal; findByRole waits for them to appear
    const enBajaOption = await screen.findByRole("option", { name: /en baja/i });

    // Use fireEvent to bypass pointer-events:none that Radix sets on <body>
    fireEvent.pointerUp(enBajaOption);
    fireEvent.click(enBajaOption);

    await waitFor(() => {
      expect(window.location.search).toContain("estado=baja");
    });
  });

  // 15 ─────────────────────────────────────────────────────────────────────────
  it('toggling the "Sin GUF" button sets aria-pressed=true and updates URL to sin_guf=1', async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });

    renderWithBrowserLocation(<FamiliasList onRowClick={noop} />, { path: "/?tab=familias" });

    const sinGufBtn = screen.getByRole("button", { name: /sin guf/i });
    expect(sinGufBtn).toHaveAttribute("aria-pressed", "false");

    await user.click(sinGufBtn);

    expect(sinGufBtn).toHaveAttribute("aria-pressed", "true");

    await waitFor(() => {
      expect(window.location.search).toContain("sin_guf=1");
    });
  });

  // 16 ─────────────────────────────────────────────────────────────────────────
  it("tRPC query is called with the correct filter inputs based on URL state", () => {
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });

    renderWithMemory(<FamiliasList onRowClick={noop} />, {
      searchPath: "tab=familias&search=test&estado=baja&sin_guf=1&sin_informe=1",
    });

    // The last call is the one after the component settles with the URL filters
    const calls = mockUseQuery.mock.calls;
    const lastCallArgs = calls[calls.length - 1][0];

    expect(lastCallArgs).toMatchObject({
      search: "test",
      estado: "baja",
      sin_alta_guf: true,
      sin_informe_social: true,
    });
    // distrito must NOT be present
    expect(lastCallArgs).not.toHaveProperty("distrito");
  });

  // 17 ─────────────────────────────────────────────────────────────────────────
  it("distrito URL param is parsed but NOT passed to the query", () => {
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });

    renderWithMemory(<FamiliasList onRowClick={noop} />, {
      searchPath: "tab=familias&distrito=carabanchel",
    });

    const calls = mockUseQuery.mock.calls;
    const lastCallArgs = calls[calls.length - 1][0];

    expect(lastCallArgs).not.toHaveProperty("distrito");
  });
});
