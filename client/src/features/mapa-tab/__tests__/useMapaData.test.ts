/** @vitest-environment jsdom */
/**
 * useMapaData hook — RED test suite (TDD phase 1).
 *
 * Tests the hook's shape contract: it wraps trpc.mapa.distritoStats.useQuery
 * and returns expected data/loading/error states. Uses vi.hoisted + vi.mock
 * for the tRPC layer (same pattern as FamiliasList.test.tsx).
 *
 * Iron Law: fix the implementation, never the test.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";

import type { DistritoStatRow } from "../../../../../server/routers/mapa";

// ── tRPC mock ─────────────────────────────────────────────────────────────────
const { mockUseQuery } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    mapa: {
      distritoStats: {
        useQuery: mockUseQuery,
      },
    },
  },
}));

// Import AFTER mocks
import { useMapaData } from "../hooks/useMapaData";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SAMPLE_ROWS: DistritoStatRow[] = [
  { distrito: "centro", count: 12, compliance: 0.83 },
  { distrito: "carabanchel", count: 7, compliance: 0.71 },
  { distrito: "vicalvaro", count: null },
];

describe("useMapaData", () => {
  it("calls trpc.mapa.distritoStats.useQuery with the provided layer", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    renderHook(() => useMapaData("densidad"));

    expect(mockUseQuery).toHaveBeenCalledWith({ layer: "densidad" });
  });

  it("calls trpc.mapa.distritoStats.useQuery with 'compliance' layer", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    renderHook(() => useMapaData("compliance"));

    expect(mockUseQuery).toHaveBeenCalledWith({ layer: "compliance" });
  });

  it("returns data rows in the expected shape when query succeeds", () => {
    mockUseQuery.mockReturnValue({
      data: { rows: SAMPLE_ROWS, layer: "densidad", kAnonymityFloor: 3 },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useMapaData("densidad"));

    expect(result.current.rows).toHaveLength(3);
    expect(result.current.rows[0].distrito).toBe("centro");
    expect(result.current.rows[0].count).toBe(12);
    expect(result.current.kAnonymityFloor).toBe(3);
  });

  it("returns null count for k-anon-suppressed districts", () => {
    mockUseQuery.mockReturnValue({
      data: { rows: SAMPLE_ROWS, layer: "densidad", kAnonymityFloor: 3 },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useMapaData("densidad"));

    const vicalvaro = result.current.rows.find((r) => r.distrito === "vicalvaro");
    expect(vicalvaro?.count).toBeNull();
  });

  it("returns isLoading=true while data is fetching", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    const { result } = renderHook(() => useMapaData("densidad"));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.rows).toHaveLength(0);
  });

  it("returns isError=true when query fails", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Network error"),
    });

    const { result } = renderHook(() => useMapaData("densidad"));

    expect(result.current.isError).toBe(true);
    expect(result.current.rows).toHaveLength(0);
  });

  it("returns compliance values on the compliance layer", () => {
    mockUseQuery.mockReturnValue({
      data: { rows: SAMPLE_ROWS, layer: "compliance", kAnonymityFloor: 3 },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useMapaData("compliance"));

    const centro = result.current.rows.find((r) => r.distrito === "centro");
    expect(centro?.compliance).toBe(0.83);
  });
});
