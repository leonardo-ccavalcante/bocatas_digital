/**
 * Contract-first tests for <InstitucionTypeahead />.
 *
 * Key contracts:
 *   - Input renders with placeholder "Buscar institución..."
 *   - No search fired when fewer than 2 characters are typed (enabled=false).
 *   - Dropdown renders when search returns results.
 *   - Clicking a result calls onChange with the picked institution.
 *   - "Crear" button appears when query >= 2 chars and results are empty.
 *   - "Crear" button opens CrearInstitucionInlineModal.
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
const { mockInstSearchUseQuery, mockInstCreateMutation } = vi.hoisted(() => ({
  mockInstSearchUseQuery: vi.fn(),
  mockInstCreateMutation: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    instituciones: {
      search: { useQuery: mockInstSearchUseQuery },
      create: { useMutation: mockInstCreateMutation },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Import AFTER mocks are registered.
import { InstitucionTypeahead } from "../InstitucionTypeahead";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const sampleInstituciones = [
  {
    id: "inst-1",
    nombre: "Cruz Roja Madrid",
    tipo: "ong",
    areas: ["salud", "vivienda"],
    direccion: "Calle Ejemplo 1",
    telefono: "910000001",
    email: "info@cruzroja.es",
    codigo_postal: "28001",
    distrito: null,
    notas: null,
    is_active: true,
  },
  {
    id: "inst-2",
    nombre: "SAMUR Social",
    tipo: "publica",
    areas: ["emergencias"],
    direccion: null,
    telefono: null,
    email: null,
    codigo_postal: null,
    distrito: null,
    notas: null,
    is_active: true,
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("InstitucionTypeahead contract", () => {
  // 1 ──────────────────────────────────────────────────────────────────────────
  it("renders an input with placeholder 'Buscar institución...'", () => {
    mockInstSearchUseQuery.mockReturnValue({ data: undefined });
    mockInstCreateMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    });

    render(<InstitucionTypeahead value={null} onChange={vi.fn()} />);

    expect(
      screen.getByPlaceholderText("Buscar institución..."),
    ).toBeInTheDocument();
  });

  // 2 ──────────────────────────────────────────────────────────────────────────
  it("does not fire search when fewer than 2 chars are typed", async () => {
    const user = userEvent.setup();
    mockInstSearchUseQuery.mockReturnValue({ data: undefined });
    mockInstCreateMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    });

    render(<InstitucionTypeahead value={null} onChange={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText("Buscar institución..."),
      "C",
    );

    // enabled=false when q.length < 2 — the last call should have enabled=false
    const calls = mockInstSearchUseQuery.mock.calls;
    const lastCall = calls[calls.length - 1];
    // Second argument to useQuery is the options object
    expect(lastCall[1]).toMatchObject({ enabled: false });
  });

  // 3 ──────────────────────────────────────────────────────────────────────────
  it("renders dropdown with results when search returns data", async () => {
    const user = userEvent.setup();
    mockInstSearchUseQuery.mockReturnValue({ data: sampleInstituciones });
    mockInstCreateMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    });

    render(<InstitucionTypeahead value={null} onChange={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText("Buscar institución..."),
      "Cruz",
    );

    expect(screen.getByText("Cruz Roja Madrid")).toBeInTheDocument();
    expect(screen.getByText("SAMUR Social")).toBeInTheDocument();
  });

  // 4 ──────────────────────────────────────────────────────────────────────────
  it("clicking a result calls onChange with the picked institution", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mockInstSearchUseQuery.mockReturnValue({ data: sampleInstituciones });
    mockInstCreateMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    });

    render(<InstitucionTypeahead value={null} onChange={onChange} />);

    await user.type(
      screen.getByPlaceholderText("Buscar institución..."),
      "Cruz",
    );

    await user.click(screen.getByText("Cruz Roja Madrid"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "inst-1",
        nombre: "Cruz Roja Madrid",
      }),
    );
  });

  // 5 ──────────────────────────────────────────────────────────────────────────
  it("shows 'Crear' button when query >= 2 chars and results are empty", async () => {
    const user = userEvent.setup();
    mockInstSearchUseQuery.mockReturnValue({ data: [] });
    mockInstCreateMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    });

    render(<InstitucionTypeahead value={null} onChange={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText("Buscar institución..."),
      "Nuevo recurso",
    );

    expect(
      screen.getByRole("button", { name: /crear/i }),
    ).toBeInTheDocument();
  });

  // 6 ──────────────────────────────────────────────────────────────────────────
  it("clicking 'Crear' opens the CrearInstitucionInlineModal (Dialog)", async () => {
    const user = userEvent.setup();
    mockInstSearchUseQuery.mockReturnValue({ data: [] });
    mockInstCreateMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    });

    render(<InstitucionTypeahead value={null} onChange={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText("Buscar institución..."),
      "Nuevo recurso",
    );

    await user.click(screen.getByRole("button", { name: /crear/i }));

    // The modal renders a Dialog with "Nueva institución" title
    expect(
      screen.getByRole("dialog", { name: /nueva institución/i }),
    ).toBeInTheDocument();
  });

  // 7 ──────────────────────────────────────────────────────────────────────────
  it("input value shows the selected institution nombre when value is provided", () => {
    mockInstSearchUseQuery.mockReturnValue({ data: undefined });
    mockInstCreateMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    });

    const selected = {
      id: "inst-1",
      nombre: "Cruz Roja Madrid",
      direccion: null,
      telefono: null,
      email: null,
      codigo_postal: null,
    };

    render(
      <InstitucionTypeahead value={selected} onChange={vi.fn()} />,
    );

    const input = screen.getByPlaceholderText("Buscar institución...");
    expect(input).toHaveValue("Cruz Roja Madrid");
  });

  // 8 ──────────────────────────────────────────────────────────────────────────
  it("does not render dropdown when value is already selected", async () => {
    const user = userEvent.setup();
    // Even if search returns data, dropdown should not show when value is set
    mockInstSearchUseQuery.mockReturnValue({ data: sampleInstituciones });
    mockInstCreateMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    });

    const selected = {
      id: "inst-1",
      nombre: "Cruz Roja Madrid",
      direccion: null,
      telefono: null,
      email: null,
      codigo_postal: null,
    };

    render(
      <InstitucionTypeahead value={selected} onChange={vi.fn()} />,
    );

    // Type more — value is set so dropdown should not open
    await user.click(screen.getByPlaceholderText("Buscar institución..."));

    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
