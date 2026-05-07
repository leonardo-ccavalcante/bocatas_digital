/**
 * Contract-first tests for <SavedViewsBar programaId={...} />.
 *
 * Spec source: Phase 1 plan Task 9
 *
 * Iron Law: these tests define the contract. Fix the component, never the test.
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

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

afterEach(cleanup);

// ── tRPC mock ─────────────────────────────────────────────────────────────────
const {
  mockListQuery,
  mockCreateMutation,
  mockDeleteMutation,
  mockUpdateMutation,
  mockUseUtils,
} = vi.hoisted(() => ({
  mockListQuery: vi.fn(),
  mockCreateMutation: vi.fn(),
  mockDeleteMutation: vi.fn(),
  mockUpdateMutation: vi.fn(),
  mockUseUtils: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    familySavedViews: {
      list: {
        useQuery: mockListQuery,
      },
      create: {
        useMutation: mockCreateMutation,
      },
      delete: {
        useMutation: mockDeleteMutation,
      },
      update: {
        useMutation: mockUpdateMutation,
      },
    },
    useUtils: mockUseUtils,
  },
}));

// ── useFamiliasFilters mock ───────────────────────────────────────────────────
const { mockApplyFilters, mockFilters } = vi.hoisted(() => ({
  mockApplyFilters: vi.fn(),
  mockFilters: { estado: "activa" as const, sinGuf: false, sinInformeSocial: false },
}));

vi.mock("../hooks/useFamiliasFilters", () => ({
  useFamiliasFilters: () => ({
    filters: mockFilters,
    applyFilters: mockApplyFilters,
  }),
}));

// ── sonner toast mock ─────────────────────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Import AFTER mocks are registered.
import { SavedViewsBar } from "../SavedViewsBar";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const savedViews = [
  {
    id: "v1",
    nombre: "Activas",
    is_shared: false,
    filters_json: { estado: "activa" },
  },
  {
    id: "v2",
    nombre: "Sin GUF",
    is_shared: true,
    filters_json: { sinGuf: true, estado: "all" },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeDeleteMock(overrides: { isPending?: boolean; mutateAsync?: ReturnType<typeof vi.fn> } = {}) {
  const mutateAsync = overrides.mutateAsync ?? vi.fn().mockResolvedValue(undefined);
  return {
    mutateAsync,
    isPending: overrides.isPending ?? false,
  };
}

function makeCreateMock(overrides: { isPending?: boolean; mutateAsync?: ReturnType<typeof vi.fn> } = {}) {
  const mutateAsync = overrides.mutateAsync ?? vi.fn().mockResolvedValue(undefined);
  return {
    mutateAsync,
    isPending: overrides.isPending ?? false,
  };
}

interface TestView {
  id: string;
  nombre: string;
  is_shared: boolean;
  filters_json: Record<string, unknown>;
}

function setupDefaultMocks(options: {
  views?: TestView[];
  deleteMock?: ReturnType<typeof makeDeleteMock>;
  createMock?: ReturnType<typeof makeCreateMock>;
} = {}) {
  const { hook } = memoryLocation();

  mockUseUtils.mockReturnValue({
    familySavedViews: {
      list: { invalidate: vi.fn() },
    },
  });

  mockListQuery.mockReturnValue({
    data: options.views ?? [],
    isLoading: false,
  });

  const deleteMock = options.deleteMock ?? makeDeleteMock();
  const createMock = options.createMock ?? makeCreateMock();

  mockDeleteMutation.mockImplementation((opts?: { onSuccess?: () => void }) => ({
    ...deleteMock,
    mutateAsync: async (args: unknown) => {
      const result = await deleteMock.mutateAsync(args);
      opts?.onSuccess?.();
      return result;
    },
  }));

  mockCreateMutation.mockImplementation((opts?: { onSuccess?: () => void }) => ({
    ...createMock,
    mutateAsync: async (args: unknown) => {
      const result = await createMock.mutateAsync(args);
      opts?.onSuccess?.();
      return result;
    },
  }));

  // update is called by useFamilySavedViews but not exercised by these tests
  mockUpdateMutation.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  });

  return { hook, deleteMock, createMock };
}

function renderBar(programaId = "p1") {
  const { hook } = memoryLocation({ path: "/" });
  return render(
    <Router hook={hook}>
      <SavedViewsBar programaId={programaId} />
    </Router>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("SavedViewsBar", () => {
  it("1. renders 'Vistas:' label", () => {
    setupDefaultMocks({ views: [] });
    renderBar();
    expect(screen.getByText(/^Vistas:$/)).toBeInTheDocument();
  });

  it("2. renders 'Nueva vista' button", () => {
    setupDefaultMocks({ views: [] });
    renderBar();
    expect(screen.getByRole("button", { name: /nueva vista/i })).toBeInTheDocument();
  });

  it("3. renders one chip per saved view with the view's nombre", () => {
    setupDefaultMocks({ views: savedViews });
    renderBar();
    expect(screen.getByRole("button", { name: /aplicar vista activas/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /aplicar vista sin guf/i })).toBeInTheDocument();
  });

  it("4. shared view chip shows Star icon with aria-label='Compartida'; non-shared does not", () => {
    setupDefaultMocks({ views: savedViews });
    renderBar();

    // Sin GUF is shared — should have the aria-label
    const sinGufChip = screen.getByRole("button", { name: /aplicar vista sin guf/i });
    const starInSinGuf = sinGufChip.querySelector('[aria-label="Compartida"]');
    expect(starInSinGuf).toBeInTheDocument();

    // Activas is NOT shared — should NOT have the aria-label
    const activasChip = screen.getByRole("button", { name: /aplicar vista activas/i });
    const starInActivas = activasChip.querySelector('[aria-label="Compartida"]');
    expect(starInActivas).not.toBeInTheDocument();
  });

  it("5. apply button has aria-label='Aplicar vista <nombre>'", () => {
    setupDefaultMocks({ views: savedViews });
    renderBar();
    expect(screen.getByRole("button", { name: "Aplicar vista Activas" })).toBeInTheDocument();
  });

  it("6. trash button has aria-label='Eliminar vista <nombre>'", () => {
    setupDefaultMocks({ views: savedViews });
    renderBar();
    expect(screen.getByRole("button", { name: "Eliminar vista Activas" })).toBeInTheDocument();
  });

  it("7. clicking the apply chip calls applyFilters with parsed filters", async () => {
    setupDefaultMocks({ views: savedViews });
    mockApplyFilters.mockClear();
    renderBar();

    await userEvent.click(screen.getByRole("button", { name: "Aplicar vista Activas" }));

    expect(mockApplyFilters).toHaveBeenCalledWith({ estado: "activa" });
  });

  it("8. apply chip drops unknown keys via safeFiltersFromJson", async () => {
    const viewWithUnknownKeys = [
      {
        id: "v3",
        nombre: "Test",
        is_shared: false,
        filters_json: { estado: "activa", evilKey: "stuff" },
      },
    ];
    setupDefaultMocks({ views: viewWithUnknownKeys });
    mockApplyFilters.mockClear();
    renderBar();

    await userEvent.click(screen.getByRole("button", { name: "Aplicar vista Test" }));

    expect(mockApplyFilters).toHaveBeenCalledWith({ estado: "activa" });
    expect(mockApplyFilters).not.toHaveBeenCalledWith(
      expect.objectContaining({ evilKey: expect.anything() }),
    );
  });

  it("9. apply chip rejects invalid types", async () => {
    const viewWithInvalidTypes = [
      {
        id: "v4",
        nombre: "Bad",
        is_shared: false,
        filters_json: { estado: "garbage", sinGuf: "not-a-bool" },
      },
    ];
    setupDefaultMocks({ views: viewWithInvalidTypes });
    mockApplyFilters.mockClear();
    renderBar();

    await userEvent.click(screen.getByRole("button", { name: "Aplicar vista Bad" }));

    // estado:"garbage" and sinGuf:"not-a-bool" should be dropped
    const call = mockApplyFilters.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call).not.toHaveProperty("estado");
    expect(call).not.toHaveProperty("sinGuf");
  });

  it("10. clicking trash calls familySavedViews.delete with the view id", async () => {
    const { deleteMock } = setupDefaultMocks({ views: savedViews });
    renderBar();

    await userEvent.click(screen.getByRole("button", { name: "Eliminar vista Activas" }));

    expect(deleteMock.mutateAsync).toHaveBeenCalledWith({ id: "v1" });
  });

  it("11. trash button is disabled when delete mutation is pending", () => {
    setupDefaultMocks({
      views: savedViews,
      deleteMock: makeDeleteMock({ isPending: true }),
    });

    // Re-setup so the isPending flag propagates to the component
    mockDeleteMutation.mockImplementation((_opts?: unknown) => ({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: true,
    }));

    renderBar();

    const trashBtn = screen.getByRole("button", { name: "Eliminar vista Activas" });
    expect(trashBtn).toBeDisabled();
  });

  it("12. clicking 'Nueva vista' opens the dialog", async () => {
    setupDefaultMocks({ views: [] });
    renderBar();

    await userEvent.click(screen.getByRole("button", { name: /nueva vista/i }));

    expect(
      screen.getByRole("dialog", { name: /guardar filtros como vista/i }),
    ).toBeInTheDocument();
  });

  it("13. Save button is disabled when name is empty", async () => {
    setupDefaultMocks({ views: [] });
    renderBar();

    await userEvent.click(screen.getByRole("button", { name: /nueva vista/i }));

    const saveBtn = screen.getByRole("button", { name: /guardar/i });
    expect(saveBtn).toBeDisabled();
  });

  it("14. Save button is disabled when create mutation is pending", async () => {
    setupDefaultMocks({
      views: [],
      createMock: makeCreateMock({ isPending: true }),
    });

    // Re-setup so isPending propagates
    mockCreateMutation.mockImplementation((_opts?: unknown) => ({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: true,
    }));

    renderBar();

    await userEvent.click(screen.getByRole("button", { name: /nueva vista/i }));
    await userEvent.type(screen.getByPlaceholderText(/ej. familias activas/i), "Mis Vista");

    const saveBtn = screen.getByRole("button", { name: /guardar/i });
    expect(saveBtn).toBeDisabled();
  });

  it("15. Save button enables after typing a name", async () => {
    setupDefaultMocks({ views: [] });
    renderBar();

    await userEvent.click(screen.getByRole("button", { name: /nueva vista/i }));
    await userEvent.type(screen.getByPlaceholderText(/ej. familias activas/i), "Mis Vista");

    const saveBtn = screen.getByRole("button", { name: /guardar/i });
    expect(saveBtn).not.toBeDisabled();
  });

  it("16. clicking Save calls familySavedViews.create with name + filtersJson + isShared", async () => {
    const { createMock } = setupDefaultMocks({ views: [] });

    // Override filters to include more fields
    (mockFilters as Record<string, unknown>).estado = "activa";
    (mockFilters as Record<string, unknown>).sinGuf = true;
    (mockFilters as Record<string, unknown>).sinInformeSocial = false;
    (mockFilters as Record<string, unknown>).search = undefined;
    (mockFilters as Record<string, unknown>).distrito = undefined;

    vi.mock("../hooks/useFamiliasFilters", () => ({
      useFamiliasFilters: () => ({
        filters: {
          estado: "activa",
          sinGuf: true,
          sinInformeSocial: false,
          search: undefined,
          distrito: undefined,
        },
        applyFilters: mockApplyFilters,
      }),
    }));

    renderBar("p-test");

    await userEvent.click(screen.getByRole("button", { name: /nueva vista/i }));
    await userEvent.type(screen.getByPlaceholderText(/ej. familias activas/i), "Mis Vista");

    // Check the shared checkbox
    const sharedCheckbox = screen.getByRole("checkbox", { name: /compartir/i });
    await userEvent.click(sharedCheckbox);

    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => {
      expect(createMock.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          programaId: "p-test",
          nombre: "Mis Vista",
          isShared: true,
        }),
      );
    });
  });

  it("17. empty-trim names are not saved (spaces only → button disabled)", async () => {
    const { createMock } = setupDefaultMocks({ views: [] });
    renderBar();

    await userEvent.click(screen.getByRole("button", { name: /nueva vista/i }));

    // Type spaces only
    const input = screen.getByPlaceholderText(/ej. familias activas/i);
    await userEvent.type(input, "   ");

    // Button should be disabled — the safest and most reliable flavor of this test
    const saveBtn = screen.getByRole("button", { name: /guardar/i });
    expect(saveBtn).toBeDisabled();
    expect(createMock.mutateAsync).not.toHaveBeenCalled();
  });

  it("18. clicking Cancelar closes the dialog without saving", async () => {
    const { createMock } = setupDefaultMocks({ views: [] });
    renderBar();

    await userEvent.click(screen.getByRole("button", { name: /nueva vista/i }));
    await userEvent.type(screen.getByPlaceholderText(/ej. familias activas/i), "Test");

    await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(createMock.mutateAsync).not.toHaveBeenCalled();
  });
});
