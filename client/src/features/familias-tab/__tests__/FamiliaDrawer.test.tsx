/**
 * Contract-first tests for <FamiliaDrawer familyId={...} onClose={() => void} />.
 *
 * Spec source: CLAUDE.md Phase 1 Task 8
 *
 * Iron Law: these tests define the contract. Fix the component, never the test.
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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

// ── tRPC mock ─────────────────────────────────────────────────────────────────
const { mockUseQuery } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    families: {
      getById: {
        useQuery: mockUseQuery,
      },
    },
  },
}));

// Import AFTER mocks are registered.
import { FamiliaDrawer } from "../FamiliaDrawer";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const familyData = {
  id: "f1",
  familia_numero: 42,
  estado: "activa",
  num_adultos: 2,
  num_menores_18: 3,
  persona_recoge: "Ana García López",
  alta_en_guf: true,
  fecha_alta_guf: "2026-03-12",
  padron_recibido: true,
  informe_social: true,
  informe_social_fecha: "2026-04-01",
  consent_bocatas: true,
  consent_banco_alimentos: true,
  docs_identidad: true,
  persons: {
    id: "p1",
    nombre: "Ana",
    apellidos: "García López",
    telefono: "+34 600 000 000",
    email: "ana@example.com",
  },
};

// Risk variant: alta_en_guf=false triggers AlertTriangle
const familyDataRisk = {
  ...familyData,
  alta_en_guf: false,
  fecha_alta_guf: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderWithMemory(ui: React.ReactElement) {
  const loc = memoryLocation({ path: "/", record: true });
  return render(
    <Router hook={loc.hook} searchHook={loc.searchHook}>
      {ui}
    </Router>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FamiliaDrawer contract", () => {
  // 1 ──────────────────────────────────────────────────────────────────────────
  it("renders nothing when familyId is null", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    renderWithMemory(<FamiliaDrawer familyId={null} onClose={vi.fn()} />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // 2 ──────────────────────────────────────────────────────────────────────────
  it("renders the dialog when familyId is provided", async () => {
    mockUseQuery.mockReturnValue({ data: familyData, isLoading: false });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={vi.fn()} />);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeVisible();
  });

  // 3 ──────────────────────────────────────────────────────────────────────────
  it("shows skeletons while loading", async () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={vi.fn()} />);

    // Dialog must be open
    await screen.findByRole("dialog");

    // At least one skeleton element should be present
    const skeletons = document.querySelectorAll("[data-slot='skeleton'], .animate-pulse, [class*='skeleton']");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  // 4 ──────────────────────────────────────────────────────────────────────────
  it("renders 'Familia #42' in title for the loaded family", async () => {
    mockUseQuery.mockReturnValue({ data: familyData, isLoading: false });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={vi.fn()} />);

    await screen.findByRole("dialog");
    expect(screen.getByText(/Familia #42/)).toBeInTheDocument();
  });

  // 5 ──────────────────────────────────────────────────────────────────────────
  it("shows AlertTriangle in title when at least one compliance flag is red", async () => {
    mockUseQuery.mockReturnValue({ data: familyDataRisk, isLoading: false });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={vi.fn()} />);

    await screen.findByRole("dialog");
    expect(screen.getByLabelText(/atención requerida/i)).toBeInTheDocument();
  });

  // 6 ──────────────────────────────────────────────────────────────────────────
  it("hides AlertTriangle in title when all compliance flags are green", async () => {
    mockUseQuery.mockReturnValue({ data: familyData, isLoading: false });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={vi.fn()} />);

    await screen.findByRole("dialog");
    expect(screen.queryByLabelText(/atención requerida/i)).toBeNull();
  });

  // 7 ──────────────────────────────────────────────────────────────────────────
  it("renders titular name as 'Titular: Ana García López'", async () => {
    mockUseQuery.mockReturnValue({ data: familyData, isLoading: false });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={vi.fn()} />);

    await screen.findByRole("dialog");
    expect(screen.getByText("Titular: Ana García López")).toBeInTheDocument();
  });

  // 8 ──────────────────────────────────────────────────────────────────────────
  it("renders 'Sin titular asignado' when persons is null", async () => {
    mockUseQuery.mockReturnValue({
      data: { ...familyData, persons: null },
      isLoading: false,
    });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={vi.fn()} />);

    await screen.findByRole("dialog");
    expect(screen.getByText("Sin titular asignado")).toBeInTheDocument();
  });

  // 9 ──────────────────────────────────────────────────────────────────────────
  it("renders Estado badge with text 'Activa' for estado=activa", async () => {
    mockUseQuery.mockReturnValue({ data: familyData, isLoading: false });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={vi.fn()} />);

    await screen.findByRole("dialog");
    expect(screen.getByText("Activa")).toBeInTheDocument();
  });

  // 10 ─────────────────────────────────────────────────────────────────────────
  it("computes Miembros = num_adultos + num_menores_18 (2+3=5)", async () => {
    mockUseQuery.mockReturnValue({ data: familyData, isLoading: false });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={vi.fn()} />);

    await screen.findByRole("dialog");
    // "5" should appear next to the Miembros label
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  // 11a ────────────────────────────────────────────────────────────────────────
  it("renders Recoge value when persona_recoge is present", async () => {
    mockUseQuery.mockReturnValue({ data: familyData, isLoading: false });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={vi.fn()} />);

    await screen.findByRole("dialog");
    expect(screen.getByText("Ana García López")).toBeInTheDocument();
  });

  // 11b ────────────────────────────────────────────────────────────────────────
  it("renders em-dash when persona_recoge is null", async () => {
    mockUseQuery.mockReturnValue({
      data: { ...familyData, persona_recoge: null },
      isLoading: false,
    });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={vi.fn()} />);

    await screen.findByRole("dialog");
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  // 12 ─────────────────────────────────────────────────────────────────────────
  it("formats informe_social_fecha as Spanish date '1/4/2026'", async () => {
    mockUseQuery.mockReturnValue({ data: familyData, isLoading: false });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={vi.fn()} />);

    await screen.findByRole("dialog");
    expect(screen.getByText("1/4/2026")).toBeInTheDocument();
  });

  // 13 ─────────────────────────────────────────────────────────────────────────
  it("renders 'Pendiente' when informe_social_fecha is null", async () => {
    mockUseQuery.mockReturnValue({
      data: { ...familyData, informe_social_fecha: null },
      isLoading: false,
    });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={vi.fn()} />);

    await screen.findByRole("dialog");
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
  });

  // 14 ─────────────────────────────────────────────────────────────────────────
  it("renders fecha_alta_guf as Spanish date '12/3/2026' when present", async () => {
    mockUseQuery.mockReturnValue({ data: familyData, isLoading: false });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={vi.fn()} />);

    await screen.findByRole("dialog");
    expect(screen.getByText("12/3/2026")).toBeInTheDocument();
  });

  // 15 ─────────────────────────────────────────────────────────────────────────
  it("renders 'Sí' when alta_en_guf=true and fecha_alta_guf=null", async () => {
    mockUseQuery.mockReturnValue({
      data: { ...familyData, fecha_alta_guf: null },
      isLoading: false,
    });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={vi.fn()} />);

    await screen.findByRole("dialog");
    expect(screen.getByText("Sí")).toBeInTheDocument();
  });

  // 16 ─────────────────────────────────────────────────────────────────────────
  it("renders 'No' when alta_en_guf=false and fecha_alta_guf=null", async () => {
    mockUseQuery.mockReturnValue({
      data: { ...familyData, alta_en_guf: false, fecha_alta_guf: null },
      isLoading: false,
    });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={vi.fn()} />);

    await screen.findByRole("dialog");
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  // 17 ─────────────────────────────────────────────────────────────────────────
  it("renders 6 compliance StatusBadges with all required labels", async () => {
    mockUseQuery.mockReturnValue({ data: familyData, isLoading: false });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={vi.fn()} />);

    await screen.findByRole("dialog");

    // Each StatusBadge renders aria-label="{label}: cumplido|pendiente".
    // Query by aria-label to uniquely target the compliance badges,
    // avoiding ambiguity with the grid labels that share the same text.
    const expectedAriaLabels = [
      /padrón:/i,
      /informe social:/i,
      /guf:/i,
      /docs identidad:/i,
      /consent\. bocatas:/i,
      /consent\. bda:/i,
    ];

    for (const ariaLabel of expectedAriaLabels) {
      expect(screen.getByLabelText(ariaLabel)).toBeInTheDocument();
    }
  });

  // 18 ─────────────────────────────────────────────────────────────────────────
  it("compliance badge shows ✓ when ok (all-green data, Padrón badge)", async () => {
    mockUseQuery.mockReturnValue({ data: familyData, isLoading: false });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={vi.fn()} />);

    await screen.findByRole("dialog");
    expect(screen.getByText(/✓.*Padrón|Padrón.*✓/)).toBeInTheDocument();
  });

  // 19 ─────────────────────────────────────────────────────────────────────────
  it("compliance badge shows ⚠ when not ok (padron_recibido=false)", async () => {
    mockUseQuery.mockReturnValue({
      data: { ...familyData, padron_recibido: false },
      isLoading: false,
    });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={vi.fn()} />);

    await screen.findByRole("dialog");
    expect(screen.getByText(/⚠.*Padrón|Padrón.*⚠/)).toBeInTheDocument();
  });

  // 20 ─────────────────────────────────────────────────────────────────────────
  it("renders 'Abrir página completa' button with link to /familias/f1", async () => {
    mockUseQuery.mockReturnValue({ data: familyData, isLoading: false });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={vi.fn()} />);

    await screen.findByRole("dialog");

    const link = screen.getByRole("link", { name: /abrir página completa/i });
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toMatch(/\/familias\/f1$/);
  });

  // 21 ─────────────────────────────────────────────────────────────────────────
  it("renders 'Familia no encontrada.' when family is undefined and not loading", async () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={vi.fn()} />);

    await screen.findByRole("dialog");
    expect(screen.getByText("Familia no encontrada.")).toBeInTheDocument();
  });

  // 22 ─────────────────────────────────────────────────────────────────────────
  it("onOpenChange(false) calls onClose when Escape is pressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    mockUseQuery.mockReturnValue({ data: familyData, isLoading: false });

    renderWithMemory(<FamiliaDrawer familyId="f1" onClose={onClose} />);

    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });
});
