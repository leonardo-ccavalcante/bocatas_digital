/**
 * PersonaDetalle — tabbed ficha (v4 visual port, Task 8).
 *
 * Contract:
 *  - The 5 tabs render: Resumen · Programas · Documentos · Asistencias · Notas.
 *  - Asistencias shows the history table for admins; non-admins get a gated
 *    "Acceso restringido" placeholder (the history table is NOT rendered).
 *  - Documentos shows its empty state when there is no document.
 *  - Notas shows its empty state when there are no notas.
 *
 * Data layers (usePersonById, useAuth, useConsentTemplates) and heavy children
 * (EnrollmentPanel, CheckinHistoryTable, ConsentModal) are mocked at the module
 * boundary so this exercises page structure + admin gating only.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as Wouter from "wouter";

// ── jsdom stubs (Radix Tabs / Avatar) ─────────────────────────────────────────
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
const { mockUsePersonById, mockUseAuth, mockCheckinUseQuery } = vi.hoisted(() => ({
  mockUsePersonById: vi.fn(),
  mockUseAuth: vi.fn(),
  mockCheckinUseQuery: vi.fn(),
}));

vi.mock("@/features/persons/hooks/usePersonById", () => ({
  usePersonById: mockUsePersonById,
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: mockUseAuth,
}));

vi.mock("@/features/persons/hooks/useConsentTemplates", () => ({
  useConsentTemplates: () => ({ data: [] }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    persons: {
      getCheckinHistory: { useQuery: mockCheckinUseQuery },
    },
  },
}));

// Heavy children — replaced with identifiable stubs.
vi.mock("@/features/programs/components/EnrollmentPanel", () => ({
  EnrollmentPanel: ({ personId, isAdmin }: { personId: string; isAdmin?: boolean }) => (
    <div data-testid="enrollment-panel" data-person={personId} data-admin={String(!!isAdmin)}>
      EnrollmentPanel
    </div>
  ),
}));

vi.mock("@/features/persons/components/CheckinHistoryTable", () => ({
  CheckinHistoryTable: ({ personId }: { personId: string }) => (
    <div data-testid="checkin-history" data-person={personId}>
      CheckinHistoryTable
    </div>
  ),
}));

vi.mock("@/features/persons/components/ConsentModal", () => ({
  ConsentModal: () => null,
}));

// wouter useParams → fixed id.
vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof Wouter>("wouter");
  return {
    ...actual,
    useParams: () => ({ id: PERSON_ID }),
    useLocation: () => ["/personas/" + PERSON_ID, vi.fn()],
    Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

const PERSON_ID = "11111111-1111-1111-1111-111111111111";

import PersonaDetalle from "../PersonaDetalle";
import type { Database } from "@/lib/database.types";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

// ── Fixture ────────────────────────────────────────────────────────────────────
// Fully-typed PersonRow (every column) so no `as unknown as` cast is needed and
// `overrides` actually take effect.
const BASE_PERSON: PersonRow = {
  alertas_activas: null,
  apellidos: "García",
  barrio_zona: null,
  canal_llegada: null,
  created_at: "2023-06-01T00:00:00Z",
  deleted_at: null,
  direccion: null,
  email: null,
  empadronado: null,
  empresa_empleo: null,
  entidad_derivadora: null,
  es_retorno: null,
  estabilidad_habitacional: null,
  estado_empleo: null,
  fase_itinerario: "acogida",
  fecha_llegada_espana: null,
  fecha_nacimiento: "1990-05-01",
  foto_documento_url: null,
  foto_perfil_url: null,
  genero: null,
  id: PERSON_ID,
  idioma_principal: "es",
  idiomas: null,
  metadata: null,
  motivo_retorno: null,
  municipio: null,
  necesidades_principales: null,
  nivel_estudios: null,
  nivel_ingresos: null,
  nombre: "Ana",
  notas_privadas: null,
  numero_documento: null,
  observaciones: null,
  pais_documento: null,
  pais_origen: null,
  persona_referencia: null,
  recorrido_migratorio: null,
  restricciones_alimentarias: null,
  role: "beneficiario",
  situacion_laboral: null,
  situacion_legal: null,
  telefono: null,
  tipo_documento: null,
  tipo_vivienda: null,
  updated_at: "2023-06-01T00:00:00Z",
};

function makePerson(overrides: Partial<PersonRow> = {}): PersonRow {
  return { ...BASE_PERSON, ...overrides };
}

function setup({
  person = makePerson(),
  role = "admin",
  total = 7,
}: {
  person?: PersonRow;
  role?: string;
  total?: number;
} = {}) {
  mockUsePersonById.mockReturnValue({
    data: person,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  mockUseAuth.mockReturnValue({ user: { role } });
  mockCheckinUseQuery.mockReturnValue({ data: { total } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("PersonaDetalle — tab structure", () => {
  it("renders the 5 tabs", () => {
    setup();
    render(<PersonaDetalle />);
    expect(screen.getByRole("tab", { name: "Resumen" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Programas" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Documentos" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Asistencias" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Notas" })).toBeInTheDocument();
  });

  it("shows the person name and estado chip in the header", () => {
    setup();
    render(<PersonaDetalle />);
    expect(screen.getByRole("heading", { name: "Ana García" })).toBeInTheDocument();
    // "Acogida" appears in both the header chip and the KPI "Fase" cell.
    expect(screen.getAllByText("Acogida").length).toBeGreaterThanOrEqual(1);
  });

  it("opens on the Resumen tab", () => {
    setup();
    render(<PersonaDetalle />);
    expect(screen.getByText("Datos de contacto")).toBeInTheDocument();
  });
});

describe("PersonaDetalle — Asistencias gating", () => {
  it("shows the check-in history for admins", async () => {
    setup({ role: "admin" });
    render(<PersonaDetalle />);
    await userEvent.click(screen.getByRole("tab", { name: "Asistencias" }));
    expect(await screen.findByTestId("checkin-history")).toBeInTheDocument();
  });

  it("hides the history and shows a gated placeholder for non-admins", async () => {
    setup({ role: "voluntario" });
    render(<PersonaDetalle />);
    await userEvent.click(screen.getByRole("tab", { name: "Asistencias" }));
    expect(await screen.findByText("Acceso restringido")).toBeInTheDocument();
    expect(screen.queryByTestId("checkin-history")).not.toBeInTheDocument();
  });

  it("hides the Familia CTA for non-admins on the Programas tab", async () => {
    setup({ role: "voluntario" });
    render(<PersonaDetalle />);
    await userEvent.click(screen.getByRole("tab", { name: "Programas" }));
    expect(await screen.findByTestId("enrollment-panel")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Registrar familia" }),
    ).not.toBeInTheDocument();
  });

  it("shows the Familia CTA for admins on the Programas tab", async () => {
    setup({ role: "admin" });
    render(<PersonaDetalle />);
    await userEvent.click(screen.getByRole("tab", { name: "Programas" }));
    expect(
      await screen.findByRole("button", { name: "Registrar familia" }),
    ).toBeInTheDocument();
  });
});

describe("PersonaDetalle — empty states (no fabricated data)", () => {
  it("Documentos shows an empty state when there is no document", async () => {
    setup({ person: makePerson({ foto_documento_url: null }) });
    render(<PersonaDetalle />);
    await userEvent.click(screen.getByRole("tab", { name: "Documentos" }));
    expect(await screen.findByText("Sin documentos")).toBeInTheDocument();
  });

  it("Notas shows an empty state when there are no notas", async () => {
    setup({ person: makePerson({ observaciones: null, notas_privadas: null }) });
    render(<PersonaDetalle />);
    await userEvent.click(screen.getByRole("tab", { name: "Notas" }));
    expect(await screen.findByText("Sin notas")).toBeInTheDocument();
  });

  it("Notas surfaces real observaciones when present", async () => {
    setup({
      person: makePerson({ observaciones: "Necesita seguimiento mensual." }),
    });
    render(<PersonaDetalle />);
    await userEvent.click(screen.getByRole("tab", { name: "Notas" }));
    expect(
      await screen.findByText("Necesita seguimiento mensual."),
    ).toBeInTheDocument();
  });
});
