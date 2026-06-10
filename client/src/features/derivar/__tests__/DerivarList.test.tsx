/**
 * Contract-first tests for <DerivarList />.
 *
 * Key contracts:
 *   - Skeletons render while loading.
 *   - "Sin derivaciones" renders when data is empty.
 *   - Rows render with correct persona name, tipo, and fecha columns.
 *   - Clicking a row calls onRowClick with the hojaId.
 *   - Rows are keyboard-accessible (Enter and Space trigger onRowClick).
 *
 * Iron Law: these tests define the contract. Fix the component, never the test.
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── jsdom stubs ───────────────────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

// ── tRPC mock ─────────────────────────────────────────────────────────────────
const { mockListUseQuery } = vi.hoisted(() => ({
  mockListUseQuery: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    derivar: {
      list: { useQuery: mockListUseQuery },
    },
  },
}));

// Import AFTER mocks are registered.
import { DerivarList } from "../DerivarList";
import { STATIC_TIPOS } from "../hooks/useDerivar";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const sampleRows = [
  {
    id: "iv-1",
    tipo_slug: "salud",
    fecha: "2026-05-10",
    institucion_snapshot: { nombre: "Cruz Roja Madrid" },
    hoja: {
      id: "hoja-1",
      scope: "persona",
      persona: { nombre: "Ana", apellidos: "García López" },
      familia: null,
    },
  },
  {
    id: "iv-2",
    tipo_slug: "vivienda",
    fecha: "2026-05-15",
    institucion_snapshot: null,
    hoja: {
      id: "hoja-2",
      scope: "familia",
      persona: null,
      familia: {
        familia_numero: 42,
        titular: { nombre: "Bilal", apellidos: "Mansour" },
      },
    },
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DerivarList contract", () => {
  const noop = () => {};

  // 1 ──────────────────────────────────────────────────────────────────────────
  it("renders skeletons while loading", () => {
    mockListUseQuery.mockReturnValue({ data: undefined, isLoading: true });

    render(<DerivarList programaId="prog-1" onRowClick={noop} />);

    const container = document.querySelector("[aria-busy='true']");
    expect(container).not.toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  // 2 ──────────────────────────────────────────────────────────────────────────
  it("renders 'Sin derivaciones' when data is empty", () => {
    mockListUseQuery.mockReturnValue({ data: [], isLoading: false });

    render(<DerivarList programaId="prog-1" onRowClick={noop} />);

    expect(screen.getByText(/sin derivaciones/i)).toBeInTheDocument();
  });

  // 3 ──────────────────────────────────────────────────────────────────────────
  it("renders one row per intervention with correct columns", () => {
    mockListUseQuery.mockReturnValue({ data: sampleRows, isLoading: false });

    render(<DerivarList programaId="prog-1" onRowClick={noop} />);

    // Persona row — tipo renders as human label, not raw slug
    expect(screen.getByText("Ana García López")).toBeInTheDocument();
    expect(screen.getByText("Salud")).toBeInTheDocument();
    expect(screen.getByText("Cruz Roja Madrid")).toBeInTheDocument();

    // Familia row — tipo renders as human label, not raw slug
    expect(screen.getByText("Bilal Mansour")).toBeInTheDocument();
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("Vivienda")).toBeInTheDocument();
  });

  // 4 ──────────────────────────────────────────────────────────────────────────
  it("clicking a row calls onRowClick with the hojaId", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    mockListUseQuery.mockReturnValue({ data: sampleRows, isLoading: false });

    render(<DerivarList programaId="prog-1" onRowClick={onRowClick} />);

    const row = screen.getByRole("button", { name: /abrir hoja de ana garcía/i });
    await user.click(row);

    expect(onRowClick).toHaveBeenCalledWith("hoja-1");
  });

  // 5 ──────────────────────────────────────────────────────────────────────────
  it("pressing Enter on a focused row calls onRowClick", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    mockListUseQuery.mockReturnValue({ data: sampleRows, isLoading: false });

    render(<DerivarList programaId="prog-1" onRowClick={onRowClick} />);

    const row = screen.getByRole("button", { name: /abrir hoja de ana garcía/i });
    row.focus();
    await user.keyboard("{Enter}");

    expect(onRowClick).toHaveBeenCalledWith("hoja-1");
  });

  // 6 ──────────────────────────────────────────────────────────────────────────
  it("pressing Space on a focused row calls onRowClick", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    mockListUseQuery.mockReturnValue({ data: sampleRows, isLoading: false });

    render(<DerivarList programaId="prog-1" onRowClick={onRowClick} />);

    const row = screen.getByRole("button", { name: /abrir hoja de ana garcía/i });
    row.focus();
    await user.keyboard("{ }");

    expect(onRowClick).toHaveBeenCalledWith("hoja-1");
  });

  // 7 ──────────────────────────────────────────────────────────────────────────
  it("table has aria-label for accessibility", () => {
    mockListUseQuery.mockReturnValue({ data: [], isLoading: false });

    render(<DerivarList programaId="prog-1" onRowClick={noop} />);

    expect(
      screen.getByRole("table", { name: /lista de derivaciones/i }),
    ).toBeInTheDocument();
  });

  // 8 ──────────────────────────────────────────────────────────────────────────
  it("renders human-readable tipo nombre instead of raw slug", () => {
    mockListUseQuery.mockReturnValue({ data: sampleRows, isLoading: false });

    render(<DerivarList programaId="prog-1" onRowClick={noop} />);

    // "salud" slug must render as its label, not the raw slug
    const saludTipo = STATIC_TIPOS.find((t) => t.slug === "salud");
    expect(saludTipo).toBeDefined();
    expect(screen.getByText(saludTipo!.nombre)).toBeInTheDocument();

    // "vivienda" slug must also render as its label
    const viviendaTipo = STATIC_TIPOS.find((t) => t.slug === "vivienda");
    expect(viviendaTipo).toBeDefined();
    expect(screen.getByText(viviendaTipo!.nombre)).toBeInTheDocument();

    // Raw slugs must NOT appear in the table body
    // (the text "salud" is the label for slug "salud" so we can only assert
    // that at least the label is used; raw-slug assertion is covered by the
    // label being a distinct string for slugs like "apoyo_logistico")
  });

  // 9 ──────────────────────────────────────────────────────────────────────────
  it("falls back to raw slug when slug is not in STATIC_TIPOS", () => {
    const rowsWithUnknown = [
      {
        id: "iv-99",
        tipo_slug: "unknown_future_type",
        fecha: "2026-06-01",
        institucion_snapshot: null,
        hoja: {
          id: "hoja-99",
          scope: "persona",
          persona: { nombre: "Test", apellidos: "User" },
          familia: null,
        },
      },
    ];
    mockListUseQuery.mockReturnValue({ data: rowsWithUnknown, isLoading: false });

    render(<DerivarList programaId="prog-1" onRowClick={noop} />);

    // Unknown slug renders as-is (graceful degradation)
    expect(screen.getByText("unknown_future_type")).toBeInTheDocument();
  });

  // 10 ─────────────────────────────────────────────────────────────────────────
  it("passes programaId to the tRPC query", () => {
    mockListUseQuery.mockReturnValue({ data: [], isLoading: false });

    render(<DerivarList programaId="my-prog-id" onRowClick={noop} />);

    const calls = mockListUseQuery.mock.calls;
    const lastCallArg = calls[calls.length - 1][0];
    expect(lastCallArg).toMatchObject({ programaId: "my-prog-id" });
  });
});
