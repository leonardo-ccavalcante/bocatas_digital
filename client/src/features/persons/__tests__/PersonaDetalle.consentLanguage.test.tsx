/**
 * FAMILIAS-7 — el escudo de protección de datos no muestra nada para unas
 * personas y sí para otras.
 *
 * Causa: la ficha pasaba `person.idioma_principal` (enum `idioma`, 9 valores)
 * tal cual como input de `persons.consentTemplates`, cuyo Zod sólo acepta
 * ["es","ar","fr","bm"]. Para en/ro/zh/wo/other la query devolvía BAD_REQUEST,
 * `templates` quedaba vacío y el modal pintaba "No hay plantillas...". El
 * wizard de alta sí aplica `getConsentTemplateLanguage()`; la ficha se lo
 * saltaba.
 *
 * Contrato que fija este test:
 *  1. La ficha consulta SIEMPRE con un idioma de plantilla válido (fallback es).
 *  2. Le pasa al modal el idioma REAL de la persona (`personLanguage`), que es
 *     lo que dispara el banner de traducción verbal exigido por ADR-0006 —
 *     nunca español en silencio.
 *
 * Harness de mocks: client/src/pages/__tests__/PersonaDetalle.test.tsx.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type * as Wouter from "wouter";
import type { Database } from "@/lib/database.types";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

const {
  mockUsePersonById,
  mockUseAuth,
  mockCheckinUseQuery,
  mockUseConsentTemplates,
  consentModalProps,
} = vi.hoisted(() => ({
  mockUsePersonById: vi.fn(),
  mockUseAuth: vi.fn(),
  mockCheckinUseQuery: vi.fn(),
  mockUseConsentTemplates: vi.fn(),
  consentModalProps: [] as Array<{ personLanguage?: string; personId?: string }>,
}));

vi.mock("@/features/persons/hooks/usePersonById", () => ({
  usePersonById: mockUsePersonById,
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: mockUseAuth }));

vi.mock("@/features/persons/hooks/useConsentTemplates", () => ({
  useConsentTemplates: mockUseConsentTemplates,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: { persons: { getCheckinHistory: { useQuery: mockCheckinUseQuery } } },
}));

vi.mock("@/features/programs/components/EnrollmentPanel", () => ({
  EnrollmentPanel: () => <div data-testid="enrollment-panel" />,
}));

vi.mock("@/features/persons/components/CheckinHistoryTable", () => ({
  CheckinHistoryTable: () => <div data-testid="checkin-history" />,
}));

vi.mock("@/features/persons/components/ConsentModal", () => ({
  ConsentModal: (props: { personLanguage?: string; personId?: string }) => {
    consentModalProps.push(props);
    return null;
  },
}));

const PERSON_ID = "11111111-1111-1111-1111-111111111111";

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof Wouter>("wouter");
  return {
    ...actual,
    useParams: () => ({ id: PERSON_ID }),
    useLocation: () => ["/personas/" + PERSON_ID, vi.fn()],
    Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import PersonaDetalle from "@/pages/PersonaDetalle";

const BASE_PERSON: PersonRow = {
  alertas_activas: null,
  apellidos: "Sánchez",
  barrio_zona: null,
  canal_llegada: null,
  codigo_postal: null,
  colectivo_otros: null,
  colectivos: null,
  created_at: "2023-06-01T00:00:00Z",
  deleted_at: null,
  direccion: null,
  distrito: null,
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
  nombre: "Esperanza",
  nombre_norm: "esperanza sanchez",
  notas_privadas: null,
  numero_documento: null,
  observaciones: null,
  pais_documento: null,
  pais_origen: null,
  persona_referencia: null,
  recorrido_migratorio: null,
  restricciones_alimentarias: null,
  role: "beneficiario",
  situacion_ante_empleo: null,
  situacion_laboral: null,
  situacion_legal: null,
  telefono: null,
  tipo_documento: null,
  tipo_vivienda: null,
  updated_at: "2023-06-01T00:00:00Z",
};

function renderFicha(idioma: PersonRow["idioma_principal"]) {
  mockUsePersonById.mockReturnValue({
    data: { ...BASE_PERSON, idioma_principal: idioma },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  mockUseAuth.mockReturnValue({ user: { role: "admin" } });
  mockCheckinUseQuery.mockReturnValue({ data: { total: 0 } });
  mockUseConsentTemplates.mockReturnValue({ data: [] });
  render(<PersonaDetalle />);
}

function templatesIdioma(): unknown {
  return mockUseConsentTemplates.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  consentModalProps.length = 0;
});

afterEach(() => cleanup());

describe("PersonaDetalle — idioma de las plantillas de consentimiento", () => {
  it.each(["en", "ro", "zh", "wo", "other"] as const)(
    "colapsa a 'es' un idioma sin lane de plantillas (%s) en vez de mandar un enum inválido",
    (idioma) => {
      renderFicha(idioma);
      expect(templatesIdioma()).toBe("es");
    },
  );

  it.each(["es", "ar", "fr", "bm"] as const)(
    "respeta el idioma cuando SÍ hay lane de plantillas (%s)",
    (idioma) => {
      renderFicha(idioma);
      expect(templatesIdioma()).toBe(idioma);
    },
  );

  it("pasa al modal el idioma real de la persona (banner de traducción verbal, ADR-0006)", () => {
    renderFicha("en");
    expect(consentModalProps.at(-1)?.personLanguage).toBe("en");
  });

  it("pasa 'ar' sin colapsarlo — el modal necesita el idioma real para el dir=rtl", () => {
    renderFicha("ar");
    expect(consentModalProps.at(-1)?.personLanguage).toBe("ar");
  });
});
