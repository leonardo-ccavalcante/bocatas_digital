/**
 * Contract-first tests for <InstitucionesPage />.
 *
 * Spec source: docs/superpowers/plans/2026-05-06-programa-familia-phase3.md Task 11
 *              client/src/pages/admin/InstitucionesPage/CODEMAP.md
 *
 * Iron Law: fix the component, never the test.
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── wouter mock ───────────────────────────────────────────────────────────────
vi.mock("wouter", async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const real = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...real,
    Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
      <a href={href}>{children}</a>
    ),
  };
});

// ── Hoisted mock factories ────────────────────────────────────────────────────
const {
  mockListUseQuery,
  mockCreateMutateAsync,
  mockUpdateMutateAsync,
  mockDeactivateMutateAsync,
  mockInvalidate,
  mockUseAuth,
} = vi.hoisted(() => ({
  mockListUseQuery: vi.fn(),
  mockCreateMutateAsync: vi.fn(),
  mockUpdateMutateAsync: vi.fn(),
  mockDeactivateMutateAsync: vi.fn(),
  mockInvalidate: vi.fn(),
  mockUseAuth: vi.fn(),
}));

// ── tRPC mock ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/trpc", () => ({
  trpc: {
    instituciones: {
      list: { useQuery: mockListUseQuery },
      create: {
        useMutation: () => ({
          mutateAsync: mockCreateMutateAsync,
          isPending: false,
        }),
      },
      update: {
        useMutation: () => ({
          mutateAsync: mockUpdateMutateAsync,
          isPending: false,
        }),
      },
      deactivate: {
        useMutation: () => ({
          mutateAsync: mockDeactivateMutateAsync,
          isPending: false,
        }),
      },
    },
    useUtils: () => ({
      instituciones: {
        list: { invalidate: mockInvalidate },
      },
    }),
  },
}));

// ── Auth mock ─────────────────────────────────────────────────────────────────
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: mockUseAuth,
}));

// ── Sonner mock ───────────────────────────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Import AFTER all mocks are registered.
import { InstitucionesPage } from "../index";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const adminUser = { id: "u1", role: "admin" };
const superadminUser = { id: "u2", role: "superadmin" };
const voluntarioUser = { id: "u3", role: "voluntario" };

const activeInst = {
  id: "inst-0001",
  nombre: "Cáritas Madrid",
  tipo: "ong",
  areas: ["salud", "vivienda"],
  direccion: "Calle Mayor 1",
  codigo_postal: "28001",
  distrito: "Centro",
  telefono: "91 123 45 67",
  email: "contacto@caritas.es",
  notas: null,
  is_active: true,
  created_by: "u1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const inactiveInst = {
  ...activeInst,
  id: "inst-0002",
  nombre: "Cruz Roja",
  is_active: false,
  areas: [],
  distrito: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderPage() {
  return render(<InstitucionesPage />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("InstitucionesPage", () => {
  // 1 ──────────────────────────────────────────────────────────────────────────
  it("renders the page title", async () => {
    mockUseAuth.mockReturnValue({ user: adminUser });
    mockListUseQuery.mockReturnValue({ data: { rows: [], total: 0 }, isLoading: false, error: null });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Instituciones/i })).toBeInTheDocument();
    });
  });

  // 2 ──────────────────────────────────────────────────────────────────────────
  it("renders lista of institutions from the mocked query", async () => {
    mockUseAuth.mockReturnValue({ user: adminUser });
    mockListUseQuery.mockReturnValue({
      data: { rows: [activeInst, inactiveInst], total: 2 },
      isLoading: false,
      error: null,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Cáritas Madrid")).toBeInTheDocument();
      expect(screen.getByText("Cruz Roja")).toBeInTheDocument();
    });
  });

  // 3 ──────────────────────────────────────────────────────────────────────────
  it("inactive institution row has data-inactive attribute", async () => {
    mockUseAuth.mockReturnValue({ user: adminUser });
    mockListUseQuery.mockReturnValue({
      data: { rows: [inactiveInst], total: 1 },
      isLoading: false,
      error: null,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Cruz Roja")).toBeInTheDocument();
    });

    const inactiveRow = screen.getByText("Cruz Roja").closest("[data-inactive]");
    expect(inactiveRow).not.toBeNull();
  });

  // 4 ──────────────────────────────────────────────────────────────────────────
  it("passes is_active: true to list query when showInactive is off", async () => {
    mockUseAuth.mockReturnValue({ user: adminUser });
    mockListUseQuery.mockReturnValue({ data: { rows: [], total: 0 }, isLoading: false, error: null });

    renderPage();

    await waitFor(() => {
      const calls = mockListUseQuery.mock.calls;
      const lastArgs = calls[calls.length - 1][0];
      expect(lastArgs).toMatchObject({ is_active: true });
    });
  });

  // 5 ──────────────────────────────────────────────────────────────────────────
  it("toggling 'Mostrar inactivas' passes is_active: undefined to the query", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ user: adminUser });
    mockListUseQuery.mockReturnValue({ data: { rows: [], total: 0 }, isLoading: false, error: null });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Mostrar inactivas/i)).toBeInTheDocument();
    });

    const toggle = screen.getByRole("switch", { name: /Mostrar inactivas/i });
    await user.click(toggle);

    await waitFor(() => {
      const calls = mockListUseQuery.mock.calls;
      const lastArgs = calls[calls.length - 1][0];
      expect(lastArgs.is_active).toBeUndefined();
    });
  });

  // 6 ──────────────────────────────────────────────────────────────────────────
  it("clicking '+ Nueva institución' opens the create dialog", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ user: adminUser });
    mockListUseQuery.mockReturnValue({ data: { rows: [], total: 0 }, isLoading: false, error: null });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Nueva institución/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Nueva institución/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    // Dialog title is rendered inside the dialog
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: /Nueva institución/i })).toBeInTheDocument();
  });

  // 7 ──────────────────────────────────────────────────────────────────────────
  it("create dialog Guardar calls create mutation with the right payload", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ user: adminUser });
    mockListUseQuery.mockReturnValue({ data: { rows: [], total: 0 }, isLoading: false, error: null });
    mockCreateMutateAsync.mockResolvedValue({ id: "new-inst", nombre: "Nueva Org" });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Nueva institución/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Nueva institución/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const dialog = screen.getByRole("dialog");
    const nombreInput = within(dialog).getByPlaceholderText(/Cáritas Madrid/i);

    await user.type(nombreInput, "Nueva Org");
    await user.click(within(dialog).getByRole("button", { name: /Guardar institución/i }));

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: "Nueva Org" }),
      );
    });
  });

  // 8 ──────────────────────────────────────────────────────────────────────────
  it("create dialog does not call mutation when nombre is blank", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ user: adminUser });
    mockListUseQuery.mockReturnValue({ data: { rows: [], total: 0 }, isLoading: false, error: null });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Nueva institución/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Nueva institución/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Guardar institución/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Guardar institución/i }));

    // After clicking with empty nombre, mutation is not called (Zod rejects)
    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
  });

  // 9 ──────────────────────────────────────────────────────────────────────────
  it("clicking Edit opens the dialog pre-filled with the institution data", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ user: adminUser });
    mockListUseQuery.mockReturnValue({
      data: { rows: [activeInst], total: 1 },
      isLoading: false,
      error: null,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Cáritas Madrid")).toBeInTheDocument();
    });

    const editBtn = screen.getByRole("button", { name: /Editar Cáritas Madrid/i });
    await user.click(editBtn);

    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByDisplayValue("Cáritas Madrid")).toBeInTheDocument();
    });
  });

  // 10 ─────────────────────────────────────────────────────────────────────────
  it("edit dialog Guardar calls update mutation with the right payload", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ user: superadminUser });
    mockListUseQuery.mockReturnValue({
      data: { rows: [activeInst], total: 1 },
      isLoading: false,
      error: null,
    });
    mockUpdateMutateAsync.mockResolvedValue({ ...activeInst, nombre: "Cáritas Actualizada" });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Cáritas Madrid")).toBeInTheDocument();
    });

    const editBtn = screen.getByRole("button", { name: /Editar Cáritas Madrid/i });
    await user.click(editBtn);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const dialog = screen.getByRole("dialog");
    const nombreInput = within(dialog).getByDisplayValue("Cáritas Madrid");
    await user.clear(nombreInput);
    await user.type(nombreInput, "Cáritas Actualizada");

    const guardarBtn = within(dialog).getByRole("button", { name: /Guardar institución/i });
    await user.click(guardarBtn);

    await waitFor(() => {
      expect(mockUpdateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ id: "inst-0001", data: expect.objectContaining({ nombre: "Cáritas Actualizada" }) }),
      );
    });
  });

  // 11 ─────────────────────────────────────────────────────────────────────────
  it("Cancelar in dialog closes without mutating", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ user: adminUser });
    mockListUseQuery.mockReturnValue({ data: { rows: [], total: 0 }, isLoading: false, error: null });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Nueva institución/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Nueva institución/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Cancelar/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Cancelar/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
  });

  // 12 ─────────────────────────────────────────────────────────────────────────
  it("superadmin sees Desactivar button for active institutions", async () => {
    mockUseAuth.mockReturnValue({ user: superadminUser });
    mockListUseQuery.mockReturnValue({
      data: { rows: [activeInst], total: 1 },
      isLoading: false,
      error: null,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Desactivar Cáritas Madrid/i })).toBeInTheDocument();
    });
  });

  // 13 ─────────────────────────────────────────────────────────────────────────
  it("admin (non-superadmin) does NOT see Desactivar button", async () => {
    mockUseAuth.mockReturnValue({ user: adminUser });
    mockListUseQuery.mockReturnValue({
      data: { rows: [activeInst], total: 1 },
      isLoading: false,
      error: null,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Cáritas Madrid")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /Desactivar/i })).toBeNull();
  });

  // 14 ─────────────────────────────────────────────────────────────────────────
  it("clicking Desactivar calls deactivate mutation", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ user: superadminUser });
    mockListUseQuery.mockReturnValue({
      data: { rows: [activeInst], total: 1 },
      isLoading: false,
      error: null,
    });
    mockDeactivateMutateAsync.mockResolvedValue({ ...activeInst, is_active: false });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Desactivar Cáritas Madrid/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Desactivar Cáritas Madrid/i }));

    await waitFor(() => {
      expect(mockDeactivateMutateAsync).toHaveBeenCalledWith({ id: "inst-0001" });
    });
  });

  // 15 ─────────────────────────────────────────────────────────────────────────
  it("voluntario sees 'No tienes permisos' message", async () => {
    mockUseAuth.mockReturnValue({ user: voluntarioUser });
    mockListUseQuery.mockReturnValue({ data: { rows: [], total: 0 }, isLoading: false, error: null });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/No tienes permisos/i)).toBeInTheDocument();
    });
  });

  // 16 ─────────────────────────────────────────────────────────────────────────
  it("renders skeletons while list is loading", async () => {
    mockUseAuth.mockReturnValue({ user: adminUser });
    mockListUseQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });

    renderPage();

    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  // 17 ─────────────────────────────────────────────────────────────────────────
  it("successful create calls toast.success and closes dialog", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ user: adminUser });
    mockListUseQuery.mockReturnValue({ data: { rows: [], total: 0 }, isLoading: false, error: null });
    mockCreateMutateAsync.mockResolvedValue({ id: "new-inst", nombre: "Nueva Org" });

    const { toast } = await import("sonner");

    renderPage();

    await user.click(screen.getByRole("button", { name: /Nueva institución/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const dialog17 = screen.getByRole("dialog");
    await user.type(within(dialog17).getByPlaceholderText(/Cáritas Madrid/i), "Nueva Org");
    await user.click(within(dialog17).getByRole("button", { name: /Guardar institución/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  // 18 ─────────────────────────────────────────────────────────────────────────
  it("create error calls toast.error", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ user: adminUser });
    mockListUseQuery.mockReturnValue({ data: { rows: [], total: 0 }, isLoading: false, error: null });
    mockCreateMutateAsync.mockRejectedValue(new Error("DB error"));

    const { toast } = await import("sonner");

    renderPage();

    await user.click(screen.getByRole("button", { name: /Nueva institución/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const dialog18 = screen.getByRole("dialog");
    await user.type(within(dialog18).getByPlaceholderText(/Cáritas Madrid/i), "Nueva Org");
    await user.click(within(dialog18).getByRole("button", { name: /Guardar institución/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
