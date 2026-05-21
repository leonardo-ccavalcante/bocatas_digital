/**
 * Contract-first tests for <FollowUpsPanel familyId={...} />.
 *
 * Spec source: E1 plan Task 8
 *
 * Iron Law: these tests define the contract. Fix the component, never the test.
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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

// ── tRPC mock ─────────────────────────────────────────────────────────────────
const {
  mockListFollowUps,
  mockCreateFollowUp,
  mockUseUtils,
} = vi.hoisted(() => ({
  mockListFollowUps: vi.fn(),
  mockCreateFollowUp: vi.fn(),
  mockUseUtils: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    families: {
      listFollowUps: {
        useQuery: mockListFollowUps,
      },
      createFollowUp: {
        useMutation: mockCreateFollowUp,
      },
    },
    useUtils: mockUseUtils,
  },
}));

// ── sonner toast mock ─────────────────────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Import AFTER mocks are registered.
import { FollowUpsPanel } from "../FollowUpsPanel";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const followUpRows = [
  {
    id: "fu1",
    family_id: "fam-1",
    fecha: "2026-05-15",
    notas: "Primera visita al domicilio",
    created_by: "user-1",
    created_at: "2026-05-15T10:00:00Z",
  },
  {
    id: "fu2",
    family_id: "fam-1",
    fecha: "2026-04-10",
    notas: "Revisión de documentación",
    created_by: "user-1",
    created_at: "2026-04-10T09:00:00Z",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function setupDefaultMocks(options: {
  rows?: typeof followUpRows;
  isLoading?: boolean;
  createMutateFn?: ReturnType<typeof vi.fn>;
} = {}) {
  const invalidateListFollowUps = vi.fn();
  const invalidateGetLatestFollowUp = vi.fn();
  const invalidateGetById = vi.fn();

  mockUseUtils.mockReturnValue({
    families: {
      listFollowUps: { invalidate: invalidateListFollowUps },
      getLatestFollowUp: { invalidate: invalidateGetLatestFollowUp },
      getById: { invalidate: invalidateGetById },
    },
  });

  mockListFollowUps.mockReturnValue({
    data: options.rows ?? followUpRows,
    isLoading: options.isLoading ?? false,
  });

  const mutateFn = options.createMutateFn ?? vi.fn();
  mockCreateFollowUp.mockImplementation(() => ({
    mutate: mutateFn,
    isPending: false,
  }));

  return { invalidateListFollowUps, invalidateGetLatestFollowUp, invalidateGetById, mutateFn };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("FollowUpsPanel", () => {
  // 1 ──────────────────────────────────────────────────────────────────────────
  it("renders the list with a formatted es-ES date and notas text", () => {
    setupDefaultMocks();
    render(<FollowUpsPanel familyId="fam-1" />);

    // "2026-05-15" formatted as es-ES → "15/5/2026"
    expect(screen.getByText("15/5/2026")).toBeInTheDocument();
    expect(screen.getByText("Primera visita al domicilio")).toBeInTheDocument();
  });

  // 2 ──────────────────────────────────────────────────────────────────────────
  it("renders the 'Añadir seguimiento' button", () => {
    setupDefaultMocks();
    render(<FollowUpsPanel familyId="fam-1" />);

    expect(
      screen.getByRole("button", { name: /añadir seguimiento/i }),
    ).toBeInTheDocument();
  });

  // 3 ──────────────────────────────────────────────────────────────────────────
  it("clicking 'Añadir seguimiento' opens a dialog with 'Fecha del seguimiento' labelled input", async () => {
    setupDefaultMocks();
    render(<FollowUpsPanel familyId="fam-1" />);

    await userEvent.click(screen.getByRole("button", { name: /añadir seguimiento/i }));

    // Dialog must be visible
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Must have a labelled date input
    expect(screen.getByLabelText(/fecha del seguimiento/i)).toBeInTheDocument();
  });

  // 4 ──────────────────────────────────────────────────────────────────────────
  it("shows 'Cargando…' while loading", () => {
    setupDefaultMocks({ rows: [], isLoading: true });
    render(<FollowUpsPanel familyId="fam-1" />);

    expect(screen.getByText("Cargando…")).toBeInTheDocument();
  });

  // 5 ──────────────────────────────────────────────────────────────────────────
  it("shows 'Sin seguimientos registrados.' when list is empty", () => {
    setupDefaultMocks({ rows: [] });
    render(<FollowUpsPanel familyId="fam-1" />);

    expect(screen.getByText("Sin seguimientos registrados.")).toBeInTheDocument();
  });

  // 6 ──────────────────────────────────────────────────────────────────────────
  it("Guardar button is disabled when fecha is empty", async () => {
    setupDefaultMocks();
    render(<FollowUpsPanel familyId="fam-1" />);

    await userEvent.click(screen.getByRole("button", { name: /añadir seguimiento/i }));

    const guardarBtn = screen.getByRole("button", { name: /guardar/i });
    expect(guardarBtn).toBeDisabled();
  });

  // 7 ──────────────────────────────────────────────────────────────────────────
  it("Guardar button enables after selecting a fecha", async () => {
    setupDefaultMocks();
    render(<FollowUpsPanel familyId="fam-1" />);

    await userEvent.click(screen.getByRole("button", { name: /añadir seguimiento/i }));

    const fechaInput = screen.getByLabelText(/fecha del seguimiento/i);
    fireEvent.change(fechaInput, { target: { value: "2026-05-20" } });

    expect(screen.getByRole("button", { name: /guardar/i })).not.toBeDisabled();
  });

  // 8 ──────────────────────────────────────────────────────────────────────────
  it("dialog has a 'Notas (opcional)' labelled textarea", async () => {
    setupDefaultMocks();
    render(<FollowUpsPanel familyId="fam-1" />);

    await userEvent.click(screen.getByRole("button", { name: /añadir seguimiento/i }));

    expect(screen.getByLabelText(/notas \(opcional\)/i)).toBeInTheDocument();
  });

  // 9 ──────────────────────────────────────────────────────────────────────────
  it("Cancelar closes the dialog without calling mutate", async () => {
    const { mutateFn } = setupDefaultMocks();
    render(<FollowUpsPanel familyId="fam-1" />);

    await userEvent.click(screen.getByRole("button", { name: /añadir seguimiento/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mutateFn).not.toHaveBeenCalled();
  });

  // 10 ─────────────────────────────────────────────────────────────────────────
  it("Guardar calls createFollowUp.mutate with correct family_id and fecha", async () => {
    const { mutateFn } = setupDefaultMocks();
    render(<FollowUpsPanel familyId="fam-1" />);

    await userEvent.click(screen.getByRole("button", { name: /añadir seguimiento/i }));

    const fechaInput = screen.getByLabelText(/fecha del seguimiento/i);
    fireEvent.change(fechaInput, { target: { value: "2026-05-20" } });

    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));

    expect(mutateFn).toHaveBeenCalledWith(
      expect.objectContaining({ family_id: "fam-1", fecha: "2026-05-20" }),
    );
  });
});
