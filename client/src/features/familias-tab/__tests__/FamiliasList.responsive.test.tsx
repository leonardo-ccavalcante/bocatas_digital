/**
 * TDD tests for Bug 2b fix: FamiliasList table must have min-w-[640px] so
 * mobile devices get horizontal scroll instead of compressed columns.
 *
 * Karpathy principle: test the observable DOM contract (class presence),
 * not internal implementation details.
 */

import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ── Mocks must be declared before imports ─────────────────────────────────────
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

// Mock useAuth to avoid trpc.useUtils dependency
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: null }),
}));

import { FamiliasList } from "../FamiliasList";

const sampleRows = [
  {
    id: "fam-1",
    familia_numero: 1,
    estado: "activa",
    num_adultos: 2,
    num_menores_18: 1,
    informe_social: null,
    alta_en_guf: false,
    persons: { nombre: "Ana", apellidos: "García" },
  },
];

function renderInRouter(ui: React.ReactElement) {
  const { hook } = memoryLocation({ path: "/" });
  return render(<Router hook={hook}>{ui}</Router>);
}

describe("FamiliasList — mobile responsiveness (Bug 2b)", () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      data: sampleRows,
      isLoading: false,
    });
  });

  it("renders the table with a min-w class for horizontal scroll on mobile", () => {
    const { container } = renderInRouter(
      <FamiliasList onRowClick={vi.fn()} />
    );

    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    // The table must have a min-w-* class to enable scroll on narrow screens
    expect(table?.className.includes("min-w-")).toBe(true);
  });

  it("wraps the table in an overflow-x-auto container for scroll", () => {
    const { container } = renderInRouter(
      <FamiliasList onRowClick={vi.fn()} />
    );

    const scrollWrapper = container.querySelector(".overflow-x-auto");
    expect(scrollWrapper).not.toBeNull();
  });
});
