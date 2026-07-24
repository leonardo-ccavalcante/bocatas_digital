/**
 * PersonsTable.getAll-limit.test.tsx — MYT-80-ATL03 review follow-up (P1, gh #80).
 *
 * Review finding: capping `persons.getAll` at a small default page (50) with
 * no caller-side override silently truncates the role/fase management table
 * (`PersonsTable.tsx`), which is not a paginated UI — it renders every row it
 * receives, with no pager. Against the real ~707-person table, that meant
 * role/fase management became unreachable for anyone past row 50.
 *
 * This test mocks trpc.persons.getAll.useQuery to behave like the real
 * server contract: it only returns the FULL mock set (60 rows — over the
 * old default of 50) when called with a `limit` that covers it. It asserts
 * BOTH halves: the explicit override is requested, AND every row (including
 * one past the old cutoff) actually renders in the table — no pager, no
 * truncation.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const TOTAL_PERSONS = 60;

function buildMockPersons(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const idx = String(i + 1).padStart(3, "0");
    return {
      id: `person-${idx}`,
      nombre: `Persona${idx}`,
      apellidos: null,
      fecha_nacimiento: null,
      fase_itinerario: "acogida",
      tipo_documento: null,
      numero_documento: null,
      situacion_legal: null,
      fecha_llegada_espana: null,
      role: "beneficiario",
      created_at: new Date(2026, 0, i + 1).toISOString(),
    };
  });
}

const mockGetAllUseQuery = vi.fn(
  (input: { limit?: number; offset?: number } | undefined) => {
    const requested = input?.limit;
    const page =
      requested !== undefined && requested >= TOTAL_PERSONS
        ? TOTAL_PERSONS
        : Math.min(requested ?? 50, TOTAL_PERSONS);
    return {
      data: { data: buildMockPersons(page), total: TOTAL_PERSONS },
      isLoading: false,
      error: null,
    };
  }
);

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { role: "admin" } }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    persons: {
      getAll: { useQuery: mockGetAllUseQuery },
      updateRole: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      updateFaseItinerario: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
  },
}));

describe("PersonsTable — getAll not silently truncated (MYT-80-ATL03)", () => {
  afterEach(() => {
    cleanup();
    mockGetAllUseQuery.mockClear();
  });

  it("requests a limit that covers the full directory (not the server's bounded default)", async () => {
    const { PersonsTable } = await import(
      "@/features/persons/components/PersonsTable"
    );
    render(<PersonsTable />);

    expect(mockGetAllUseQuery).toHaveBeenCalled();
    const [input] = mockGetAllUseQuery.mock.calls[0] as [
      { limit?: number; offset?: number } | undefined,
    ];
    expect(input?.limit).toBeDefined();
    expect(input!.limit as number).toBeGreaterThanOrEqual(TOTAL_PERSONS);
  });

  it("renders a person past the old 50-row cutoff (role/fase management reachable)", async () => {
    const { PersonsTable } = await import(
      "@/features/persons/components/PersonsTable"
    );
    render(<PersonsTable />);

    const lastName = `Persona${String(TOTAL_PERSONS).padStart(3, "0")}`;
    expect(screen.getByText(lastName)).toBeInTheDocument();
    // Every mock row rendered — no silent truncation to the first page.
    expect(screen.getAllByText(/^Persona\d{3}$/)).toHaveLength(TOTAL_PERSONS);
  });
});
