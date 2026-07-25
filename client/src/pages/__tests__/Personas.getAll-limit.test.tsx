/**
 * Personas.getAll-limit.test.tsx — MYT-80-ATL03 review follow-up (P1, gh #80).
 *
 * Review finding: capping `persons.getAll` at a small default page (50) with
 * no caller-side override silently truncates the admin directory
 * (`pages/Personas.tsx`), which filters/sorts/counts over the FULL person
 * set client-side (`Personas.hooks.ts` usePersonsData is not a paginated
 * consumer). Against the real ~707-person table, that meant: the "Todas"
 * pill under-counted, and a text search for anyone alphabetically past the
 * cutoff returned a false "no results".
 *
 * The fix: both call sites (this page + PersonsTable.tsx) now pass an
 * explicit `{ limit: PERSONS_DIRECTORY_FULL_LIMIT }` sized to cover today's
 * real directory instead of relying on the server's bounded default.
 *
 * This test mocks trpc.persons.getAll.useQuery to behave like the real
 * server contract: it only returns the FULL mock set (60 persons — well
 * over the old default of 50) when called with a `limit` that covers it;
 * an omitted/insufficient limit simulates the truncation this fix must
 * avoid. It was RED against the pre-fix call site (`useQuery(undefined, …)`
 * always hit the truncated branch) and is GREEN now that Personas.tsx passes
 * PERSONS_DIRECTORY_FULL_LIMIT explicitly.
 *
 * Mocking pattern for useAuth/trpc: client/src/pages/__tests__/PersonaDetalle.test.tsx.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

// 60 > the old default limit (50) — proves the directory is no longer
// silently truncated to the first page.
const TOTAL_PERSONS = 60;

type MockPerson = {
  id: string;
  nombre: string;
  apellidos: string | null;
  fase_itinerario: string | null;
  created_at: string | null;
  foto_perfil_url: string | null;
  role: string;
};

function buildMockPersons(n: number): MockPerson[] {
  return Array.from({ length: n }, (_, i) => {
    const idx = String(i + 1).padStart(3, "0");
    return {
      id: `person-${idx}`,
      nombre: `Persona${idx}`,
      apellidos: null,
      fase_itinerario: null,
      created_at: new Date(2026, 0, i + 1).toISOString(),
      foto_perfil_url: null,
      role: "beneficiario",
    };
  });
}

const mockGetAllUseQuery = vi.fn(
  (input: { limit?: number; offset?: number } | undefined) => {
    // Mirrors the real server contract (server/routers/persons/crud.ts):
    // only a caller-provided `limit` that covers the full set gets it all;
    // otherwise this simulates the server's bounded default (truncation).
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

const mockSearchUseQuery = vi.fn(() => ({
  data: undefined,
  isLoading: false,
  isFetching: false,
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { role: "admin" } }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    persons: {
      getAll: { useQuery: mockGetAllUseQuery },
      search: { useQuery: mockSearchUseQuery },
    },
  },
}));

vi.mock("wouter", async () => {
  const real = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...real,
    useLocation: () => ["/personas", vi.fn()],
  };
});

describe("Personas (admin directory) — getAll not silently truncated (MYT-80-ATL03)", () => {
  afterEach(() => {
    cleanup();
    mockGetAllUseQuery.mockClear();
  });

  it("requests a limit that covers the full directory (not the server's bounded default)", async () => {
    const { default: Personas } = await import("@/pages/Personas");
    render(<Personas />);

    expect(mockGetAllUseQuery).toHaveBeenCalled();
    const [input] = mockGetAllUseQuery.mock.calls[0] as [
      { limit?: number; offset?: number } | undefined,
    ];
    // Must be an explicit override — omitting it (as the pre-fix call site
    // did) would fall into this test's truncated branch.
    expect(input?.limit).toBeDefined();
    expect(input!.limit as number).toBeGreaterThanOrEqual(TOTAL_PERSONS);
  });

  it("surfaces the true total (not the old 50-row cap) in the result count", async () => {
    const { default: Personas } = await import("@/pages/Personas");
    render(<Personas />);

    const count = screen.getByTestId("personas-result-count");
    expect(count.textContent).toContain(String(TOTAL_PERSONS));
  });

  it("an admin can reach and search a person past the old 50-row cutoff", async () => {
    const { default: Personas } = await import("@/pages/Personas");
    const user = userEvent.setup();
    render(<Personas />);

    // Persona060 sorts after the first 50 rows a truncated page would have
    // returned — reachability depends on the full set being loaded.
    const targetName = `Persona${String(TOTAL_PERSONS).padStart(3, "0")}`;
    const input = screen.getByTestId("personas-search-input");
    await user.type(input, targetName);

    const count = screen.getByTestId("personas-result-count");
    expect(count.textContent).toMatch(/^1\s/);
  });
});
