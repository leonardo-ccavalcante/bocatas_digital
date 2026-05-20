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
        persons: { nombre: "Bilal", apellidos: "Mansour" },
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

    // Persona row
    expect(screen.getByText("Ana García López")).toBeInTheDocument();
    expect(screen.getByText("salud")).toBeInTheDocument();
    expect(screen.getByText("Cruz Roja Madrid")).toBeInTheDocument();

    // Familia row
    expect(screen.getByText("Bilal Mansour")).toBeInTheDocument();
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("vivienda")).toBeInTheDocument();
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
  it("passes programaId to the tRPC query", () => {
    mockListUseQuery.mockReturnValue({ data: [], isLoading: false });

    render(<DerivarList programaId="my-prog-id" onRowClick={noop} />);

    const calls = mockListUseQuery.mock.calls;
    const lastCallArg = calls[calls.length - 1][0];
    expect(lastCallArg).toMatchObject({ programaId: "my-prog-id" });
  });
});
