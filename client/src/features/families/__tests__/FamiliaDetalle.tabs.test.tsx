/**
 * FamiliaDetalle — tabbed ficha (v4 visual port, Task 10b).
 *
 * Contract:
 *  - The 4 tabs render: Información · Documentación · GUF · Entregas.
 *  - Opens on Información, showing the real titular + composición + members
 *    roster sourced from families.getById (no fabricated data).
 *  - Switching to Entregas surfaces the real delivery rows (entregas.getDeliveries);
 *    an empty result yields the neutral "Sin entregas registradas" state.
 *  - The header shows "Familia #N", the estado pill and the titular line.
 *
 * Data layers (useFamiliaById, useDeliveries, useReactivateFamilia) and heavy
 * children (the doc cards, GufPanel, SocialReportPanel, modals) are mocked at
 * the module boundary so this exercises page structure + tab switching only.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as Wouter from "wouter";

// ── jsdom stubs (Radix Tabs) ───────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// ── hoisted mock fns ───────────────────────────────────────────────────────────
const { mockUseFamiliaById, mockUseDeliveries, mockUseReactivate } = vi.hoisted(
  () => ({
    mockUseFamiliaById: vi.fn(),
    mockUseDeliveries: vi.fn(),
    mockUseReactivate: vi.fn(),
  }),
);

vi.mock("@/features/families/hooks/useFamilias", () => ({
  useFamiliaById: mockUseFamiliaById,
  useDeliveries: mockUseDeliveries,
  useReactivateFamilia: mockUseReactivate,
}));

// Heavy children — replaced with identifiable stubs so we test structure only.
vi.mock("../components/GufPanel", () => ({
  GufPanel: () => <div data-testid="guf-panel">GufPanel</div>,
}));
vi.mock("../components/SocialReportPanel", () => ({
  SocialReportPanel: () => <div data-testid="social-report">SocialReportPanel</div>,
}));
vi.mock("../components/DeactivationForm", () => ({
  DeactivationForm: () => <button type="button">Dar de baja</button>,
}));
vi.mock("@/components/MemberManagementModal", () => ({
  MemberManagementModal: () => null,
}));
vi.mock("@/components/DocumentUploadModal", () => ({
  DocumentUploadModal: () => null,
}));
vi.mock("@/components/DeliveryDocumentModal", () => ({
  DeliveryDocumentModal: () => null,
}));
vi.mock("@/pages/FamiliaDetalle/FamilyDocsCard", () => ({
  FamilyDocsCard: () => <div data-testid="family-docs">FamilyDocsCard</div>,
}));
vi.mock("@/pages/FamiliaDetalle/MembersDocsCard", () => ({
  MembersDocsCard: () => <div data-testid="members-docs">MembersDocsCard</div>,
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof Wouter>("wouter");
  return {
    ...actual,
    useParams: () => ({ id: FAMILY_ID }),
    useLocation: () => ["/familias/" + FAMILY_ID, vi.fn()],
    Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

const FAMILY_ID = "22222222-2222-2222-2222-222222222222";

import FamiliaDetalle from "@/pages/FamiliaDetalle";

// ── Fixture (real-shaped family from families.getById) ──────────────────────────
function makeFamily(overrides: Record<string, unknown> = {}) {
  return {
    id: FAMILY_ID,
    familia_numero: 142,
    estado: "activa",
    num_adultos: 2,
    num_menores_18: 1,
    persona_recoge: "Ana García",
    autorizado: false,
    alta_en_guf: true,
    fecha_alta_guf: "2025-09-04",
    informe_social: true,
    informe_social_fecha: "2025-10-01",
    guf_cutoff_day: 15,
    guf_verified_at: null,
    persons: {
      id: "person-1",
      nombre: "Ana",
      apellidos: "García",
      telefono: "600111222",
      fecha_nacimiento: "1985-01-01",
    },
    miembros: [
      { nombre: "Luis", apellidos: "García", fecha_nacimiento: "2015-03-10" },
    ],
    ...overrides,
  };
}

function setup({
  family = makeFamily(),
  deliveries = [],
}: {
  family?: Record<string, unknown> | null;
  deliveries?: Array<Record<string, unknown>>;
} = {}) {
  mockUseFamiliaById.mockReturnValue({ data: family, isLoading: false });
  mockUseDeliveries.mockReturnValue({ data: { data: deliveries } });
  mockUseReactivate.mockReturnValue({ mutate: vi.fn(), isPending: false });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("FamiliaDetalle — tab structure", () => {
  it("renders the 4 tabs", () => {
    setup();
    render(<FamiliaDetalle />);
    expect(screen.getByRole("tab", { name: /Información/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Documentación/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /GUF/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Entregas/ })).toBeInTheDocument();
  });

  it("shows the family number, estado pill and titular in the header", () => {
    setup();
    render(<FamiliaDetalle />);
    expect(
      screen.getByRole("heading", { name: "Familia #142" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();
    // Titular name appears in header + Información tab (real field, not fabricated)
    expect(screen.getAllByText(/Ana García/).length).toBeGreaterThanOrEqual(1);
  });

  it("opens on the Información tab with the real members roster", () => {
    setup();
    render(<FamiliaDetalle />);
    expect(screen.getByText("Composición del hogar")).toBeInTheDocument();
    expect(screen.getByText(/Luis García/)).toBeInTheDocument();
  });
});

describe("FamiliaDetalle — tab switching", () => {
  it("switches to Documentación and renders the doc cards", async () => {
    setup();
    render(<FamiliaDetalle />);
    await userEvent.click(screen.getByRole("tab", { name: /Documentación/ }));
    expect(await screen.findByTestId("family-docs")).toBeInTheDocument();
    expect(screen.getByTestId("members-docs")).toBeInTheDocument();
  });

  it("switches to GUF and renders the GUF panel", async () => {
    setup();
    render(<FamiliaDetalle />);
    await userEvent.click(screen.getByRole("tab", { name: /GUF/ }));
    expect(await screen.findByTestId("guf-panel")).toBeInTheDocument();
  });

  it("switches to Entregas and shows real delivery rows", async () => {
    setup({
      deliveries: [
        {
          id: "d1",
          fecha_entrega: "2026-04-30",
          recogido_por: "Inés R.",
          es_autorizado: false,
          kg_frutas_hortalizas: 12,
          kg_carne: 3,
        },
      ],
    });
    render(<FamiliaDetalle />);
    await userEvent.click(screen.getByRole("tab", { name: /Entregas/ }));
    expect(await screen.findByText("Historial de entregas")).toBeInTheDocument();
    expect(screen.getByText("Inés R.")).toBeInTheDocument();
  });

  it("shows the neutral empty state when there are no deliveries", async () => {
    setup({ deliveries: [] });
    render(<FamiliaDetalle />);
    await userEvent.click(screen.getByRole("tab", { name: /Entregas/ }));
    expect(
      await screen.findByText("Sin entregas registradas"),
    ).toBeInTheDocument();
  });
});

describe("FamiliaDetalle — not found", () => {
  it("renders a not-found message when the family is missing", () => {
    setup({ family: null });
    render(<FamiliaDetalle />);
    expect(screen.getByText("Familia no encontrada")).toBeInTheDocument();
  });
});

describe("FamiliaDetalle — loading skeleton", () => {
  it("renders skeleton placeholders while data is loading", () => {
    mockUseFamiliaById.mockReturnValue({ data: undefined, isLoading: true });
    mockUseDeliveries.mockReturnValue({ data: undefined });
    mockUseReactivate.mockReturnValue({ mutate: vi.fn(), isPending: false });
    render(<FamiliaDetalle />);
    // Skeleton elements are present — role="status" by shadcn Skeleton
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

describe("FamiliaDetalle — estado baja", () => {
  it("renders the Reactivar affordance when estado is baja", () => {
    setup({ family: makeFamily({ estado: "baja" }) });
    render(<FamiliaDetalle />);
    expect(screen.getByRole("button", { name: /Reactivar/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Dar de baja/i })).not.toBeInTheDocument();
  });
});
