/**
 * @vitest-environment jsdom
 *
 * derivar.a11y.test.tsx — Smoke tests de accesibilidad para el flujo de Derivaciones.
 *
 * Contract (karpathy §1 — Root Cause):
 *   El Dialog "Nueva intervención" en DerivarTab debe renderizar con nombre accesible
 *   cuando `newOpen=true`. Esto verifica que Radix UI puede encontrar el `titleId`
 *   en el DOM (sin el warning "DialogContent requires a DialogTitle").
 *
 *   El fix aplicado (bc91da9c) eliminó los `id=` manuales en `DialogTitle` y los
 *   `aria-labelledby=` en `DialogContent`. Radix gestiona el `titleId` automáticamente.
 *
 * Tests:
 *   1. DerivarTab — el botón "Nueva intervención" existe y es accesible
 *   2. DerivarTab — el Dialog "Nueva intervención" tiene nombre accesible cuando open=true
 *   3. CrearInstitucionInlineModal — dialog con nombre accesible
 *
 * Iron Law: estos tests definen el contrato. Arreglar el componente, nunca el test.
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
vi.mock("@/lib/trpc", () => ({
  trpc: {
    persons: {
      search: {
        useQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
      },
    },
    families: {
      getAll: {
        useQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
      },
    },
    derivar: {
      listHojas: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false })),
      },
      startIntervention: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
      addIntervention: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
    },
    instituciones: {
      list: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false })),
      },
      create: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
    },
    useUtils: vi.fn(() => ({
      derivar: {
        listHojas: { invalidate: vi.fn() },
      },
    })),
  },
}));

// ── Mock de DerivarList (tiene sus propios hooks) ─────────────────────────────
vi.mock("../DerivarList", () => ({
  DerivarList: ({ onSelectHoja }: { onSelectHoja: (id: string) => void }) => (
    <div data-testid="derivar-list">
      <button onClick={() => onSelectHoja("hoja-1")}>Hoja 1</button>
    </div>
  ),
}));

// ── Mock de HojaDrawer ────────────────────────────────────────────────────────
vi.mock("../HojaDrawer", () => ({
  HojaDrawer: () => <div data-testid="hoja-drawer" />,
}));

// ── Mock de NuevaIntervencionForm ─────────────────────────────────────────────
vi.mock("../NuevaIntervencionForm", () => ({
  NuevaIntervencionForm: () => <div data-testid="nueva-intervencion-form" />,
}));

// ── Imports ───────────────────────────────────────────────────────────────────
import DerivarTab from "../index";
import { CrearInstitucionInlineModal } from "../CrearInstitucionInlineModal";

afterEach(cleanup);

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Derivar — accessible dialog names (a11y smoke)", () => {
  it("1. DerivarTab renders 'Nueva intervención' button", () => {
    render(<DerivarTab programaId="prog-1" />);
    expect(
      screen.getByRole("button", { name: /nueva intervención/i })
    ).toBeInTheDocument();
  });

  it("2. DerivarTab — Dialog 'Nueva intervención' has accessible name when open", () => {
    render(<DerivarTab programaId="prog-1" />);
    // Abrir el dialog
    fireEvent.click(screen.getByRole("button", { name: /nueva intervención/i }));
    // El dialog debe tener nombre accesible (sin warning de Radix)
    expect(
      screen.getByRole("dialog", { name: /nueva intervención/i })
    ).toBeInTheDocument();
  });

  it("3. CrearInstitucionInlineModal renders dialog with accessible name", () => {
    render(
      <CrearInstitucionInlineModal
        open={true}
        onClose={() => {}}
        onCreated={() => {}}
      />
    );
    expect(
      screen.getByRole("dialog", { name: /nueva institución/i })
    ).toBeInTheDocument();
  });
});
