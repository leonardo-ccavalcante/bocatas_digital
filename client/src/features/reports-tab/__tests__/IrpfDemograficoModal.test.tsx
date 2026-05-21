/**
 * @vitest-environment jsdom
 *
 * IrpfDemograficoModal.test.tsx — Contract tests for the IRPF Demográfico modal.
 *
 * Tests:
 *   1. Year input defaults to current year.
 *   2. Loading state renders skeletons.
 *   3. A suppressed cell (count: null) renders "—".
 *   4. Suppression banner appears when totalSuppressedMarginal > 0.
 *   5. "CSV (marginales)" button calls exportRowsAsCsv with ONLY non-suppressed rows.
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// ── jsdom stubs ───────────────────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

// ── Mock useIrpfDemografico ───────────────────────────────────────────────────
const { mockUseIrpfDemografico } = vi.hoisted(() => ({
  mockUseIrpfDemografico: vi.fn(),
}));

vi.mock("../hooks/useTemplatedReports", () => ({
  useIrpfDemografico: mockUseIrpfDemografico,
}));

// ── Mock exportRowsAsCsv ──────────────────────────────────────────────────────
const { mockExportRowsAsCsv } = vi.hoisted(() => ({
  mockExportRowsAsCsv: vi.fn(),
}));

vi.mock("../utils/exportCsv", () => ({
  exportRowsAsCsv: mockExportRowsAsCsv,
}));

// Import AFTER mocks are registered.
import { IrpfDemograficoModal } from "../templates/IrpfDemograficoModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();

/** Minimal suppressed marginal row for testing null-cell rendering. */
const marginalsWithSuppressed = {
  age: [
    { key: "18-30", count: 5 },
    { key: "31-45", count: null }, // suppressed
  ],
  genero: [{ key: "Mujer", count: 8 }],
  estudios: [{ key: "Primarios", count: 3 }],
  laboral: [{ key: "Desempleado", count: 7 }],
  pais: [{ key: "Marruecos", count: 4 }],
};

const sampleData = {
  year: CURRENT_YEAR,
  totalMiembros: 30,
  marginals: marginalsWithSuppressed,
  crossTab: [
    {
      age_bracket: "18-30",
      genero: "Mujer",
      nivel_estudios: "Primarios",
      situacion_laboral: "Desempleado",
      pais_origen: "Marruecos",
      count: 3,
    },
  ],
  totalSuppressed: 0,
  totalSuppressedMarginal: 1,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("IrpfDemograficoModal", () => {
  it("renders year input defaulting to current year", () => {
    mockUseIrpfDemografico.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
    render(<IrpfDemograficoModal open={true} onClose={vi.fn()} />);
    const input = screen.getByLabelText(/año fiscal/i) as HTMLInputElement;
    expect(input.value).toBe(String(CURRENT_YEAR));
  });

  it("renders skeletons while loading", () => {
    mockUseIrpfDemografico.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
    render(<IrpfDemograficoModal open={true} onClose={vi.fn()} />);
    // Skeletons are rendered as divs with animate-pulse (shadcn Skeleton)
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders '—' for a suppressed cell (count: null)", () => {
    mockUseIrpfDemografico.mockReturnValue({
      data: sampleData,
      isLoading: false,
      error: null,
    });
    render(<IrpfDemograficoModal open={true} onClose={vi.fn()} />);
    // The age bracket "31-45" has count: null — must render as "—"
    const suppressedCells = screen.getAllByText("—");
    expect(suppressedCells.length).toBeGreaterThan(0);
  });

  it("shows suppression banner when totalSuppressedMarginal > 0", () => {
    mockUseIrpfDemografico.mockReturnValue({
      data: sampleData,
      isLoading: false,
      error: null,
    });
    render(<IrpfDemograficoModal open={true} onClose={vi.fn()} />);
    const banner = screen.getByRole("alert");
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toMatch(/privacidad|k-anon/i);
  });

  it("CSV (marginales) calls exportRowsAsCsv with only non-suppressed rows", () => {
    mockUseIrpfDemografico.mockReturnValue({
      data: sampleData,
      isLoading: false,
      error: null,
    });
    render(<IrpfDemograficoModal open={true} onClose={vi.fn()} />);

    const csvBtn = screen.getByRole("button", { name: /csv \(marginales\)/i });
    fireEvent.click(csvBtn);

    expect(mockExportRowsAsCsv).toHaveBeenCalledOnce();

    const [rows] = mockExportRowsAsCsv.mock.calls[0] as [
      { dimension: string; valor: string; n: number }[],
      unknown,
    ];

    // All returned rows must have a non-null count (suppressed row excluded)
    const hasNullCount = rows.some((r) => r.n === null || r.n === undefined);
    expect(hasNullCount).toBe(false);

    // The suppressed "31-45" row should NOT be in the export
    const hasSuppressed = rows.some(
      (r) => r.dimension === "Edad" && r.valor === "31-45",
    );
    expect(hasSuppressed).toBe(false);

    // The non-suppressed "18-30" row SHOULD be present
    const hasNonSuppressed = rows.some(
      (r) => r.dimension === "Edad" && r.valor === "18-30" && r.n === 5,
    );
    expect(hasNonSuppressed).toBe(true);
  });

  it("CSV (cruzado) calls exportRowsAsCsv with only non-suppressed cross-tab rows", () => {
    const dataWithCrossTabSuppression = {
      ...sampleData,
      crossTab: [
        {
          age_bracket: "18-30",
          genero: "Mujer",
          nivel_estudios: "Primarios",
          situacion_laboral: "Desempleado",
          pais_origen: "Marruecos",
          count: 4, // visible
        },
        {
          age_bracket: "31-45",
          genero: "Hombre",
          nivel_estudios: "Secundarios",
          situacion_laboral: "Empleado",
          pais_origen: "Senegal",
          count: null, // suppressed
        },
      ],
    };

    mockUseIrpfDemografico.mockReturnValue({
      data: dataWithCrossTabSuppression,
      isLoading: false,
      error: null,
    });
    render(<IrpfDemograficoModal open={true} onClose={vi.fn()} />);

    const csvBtn = screen.getByRole("button", { name: /csv \(cruzado\)/i });
    fireEvent.click(csvBtn);

    expect(mockExportRowsAsCsv).toHaveBeenCalledOnce();

    const [rows] = mockExportRowsAsCsv.mock.calls[0] as [
      { edad: string; genero: string; estudios: string; empleo: string; pais: string; n: number }[],
      unknown,
    ];

    // The suppressed row (count: null) must be excluded
    const hasSuppressed = rows.some((r) => r.edad === "31-45");
    expect(hasSuppressed).toBe(false);

    // The visible row (count: 4) must be included with the correct value
    const hasVisible = rows.some((r) => r.edad === "18-30" && r.n === 4);
    expect(hasVisible).toBe(true);
  });
});
