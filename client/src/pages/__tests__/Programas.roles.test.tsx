/**
 * Programas.roles.test.tsx — RC-07 (F109/F142).
 * /programas para voluntarios debe usar programs.getAll (voluntarioProcedure,
 * ya filtrado por volunteer_can_access en el servidor) y NO
 * programs.getAllWithCounts (adminProcedure → FORBIDDEN → página vacía).
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

const { mockGetAllUseQuery, mockGetAllWithCountsUseQuery, mockUseAuth } = vi.hoisted(() => ({
  mockGetAllUseQuery: vi.fn(),
  mockGetAllWithCountsUseQuery: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    programs: {
      getAll: { useQuery: mockGetAllUseQuery },
      getAllWithCounts: { useQuery: mockGetAllWithCountsUseQuery },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    useUtils: () => ({
      programs: {
        getAll: { invalidate: vi.fn() },
        getAllWithCounts: { invalidate: vi.fn() },
      },
    }),
  },
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: mockUseAuth }));

vi.mock("@/features/programs/components/ProgramCard", () => ({
  ProgramCard: ({ program }: { program: { name: string } }) => (
    <div data-testid="program-card">{program.name}</div>
  ),
}));
vi.mock("@/features/programs/components/ProgramForm", () => ({
  ProgramForm: () => null,
}));

import Programas from "@/pages/Programas";

const volRow = {
  id: "p1", slug: "comedor", name: "Comedor", description: null, icon: null,
  is_default: true, is_active: true, display_order: 1,
  volunteer_can_access: true, requires_consents: [], fecha_inicio: null,
  fecha_fin: null, config: {}, parent_id: null, tipo: "basico",
  inscribible: false, estados_habilitados: [], plazas: null, etiquetas: [],
};

const adminRow = {
  ...volRow, id: "p2", slug: "ropero", name: "Ropero",
  active_enrollments: 4, total_enrollments: 9, new_this_month: 1,
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function arm() {
  mockGetAllUseQuery.mockReturnValue({ data: [volRow], isLoading: false, error: null });
  mockGetAllWithCountsUseQuery.mockReturnValue({
    data: [adminRow], isLoading: false, error: null, refetch: vi.fn(),
  });
}

describe("Programas — fuente de datos según rol", () => {
  it("voluntario: lista desde programs.getAll y desactiva getAllWithCounts", () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1", role: "voluntario" } });
    arm();
    render(<Programas />);

    expect(screen.getByText("Comedor")).toBeInTheDocument();
    expect(screen.queryByText("Ropero")).toBeNull();

    const [, opts] = mockGetAllWithCountsUseQuery.mock.calls[0];
    expect(opts).toMatchObject({ enabled: false });
  });

  it("admin: lista desde programs.getAllWithCounts (con contadores)", () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1", role: "admin" } });
    arm();
    render(<Programas />);

    expect(screen.getByText("Ropero")).toBeInTheDocument();
    expect(screen.queryByText("Comedor")).toBeNull();
  });
});
