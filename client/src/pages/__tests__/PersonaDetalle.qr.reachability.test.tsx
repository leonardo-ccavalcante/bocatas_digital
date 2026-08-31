/**
 * PersonaDetalle — alcanzabilidad de la barra de acciones.
 *
 * Por qué existe: el QR vivía en un bloque `hidden … sm:flex` de PersonaHeader
 * (port visual v4, 1ddf694). Por debajo de 640px desaparecían el QR Y los
 * consentimientos, así que un admin con el teléfono —el dispositivo desde el que
 * se dan las altas— no tenía NINGUNA ruta al QR de una persona. Ninguna prueba
 * lo cubría: PersonaDetalle.test.tsx y PersonaHeader.kpi.test.tsx no mencionan
 * el QR ni una vez.
 *
 * AGENTS.md §Coordination: "Test reachability, not just units". Aquí se monta la
 * página entera y se comprueba que se llega a los controles, no que un
 * componente sabe pintarlos.
 *
 * jsdom no tiene media queries, así que la anchura no se puede simular: la
 * comprobación honesta es estructural — ningún ancestro del enlace lleva la
 * clase `hidden`. Es el assert que se rompe si alguien reintroduce el gate.
 *
 * Desde el rediseño de la barra, las acciones viven DENTRO de la cabecera, en
 * un desplegable «Acciones» plegado por defecto. Eso cambia el enunciado, no la
 * garantía: plegado no es escondido. Lo que se exige aquí es que el disparador
 * esté rotulado y sin gate de anchura, y que desde él se llegue a todo. Lo que
 * NO se acepta es volver a un estado donde el QR no tenga ninguna ruta.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as Wouter from "wouter";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

const { mockUsePersonById, mockUseAuth, mockCheckinUseQuery, estado } = vi.hoisted(() => ({
  mockUsePersonById: vi.fn(),
  mockUseAuth: vi.fn(),
  mockCheckinUseQuery: vi.fn(),
  /** Cadena de búsqueda que devuelve el useSearch mockeado. */
  estado: { search: "", navigate: vi.fn() },
}));

vi.mock("@/features/persons/hooks/usePersonById", () => ({
  usePersonById: mockUsePersonById,
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: mockUseAuth }));

vi.mock("@/features/persons/hooks/useConsentTemplates", () => ({
  useConsentTemplates: () => ({ data: [] }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    persons: {
      getCheckinHistory: { useQuery: mockCheckinUseQuery },
      update: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
      softDelete: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
    },
  },
}));

vi.mock("@/features/programs/components/EnrollmentPanel", () => ({
  EnrollmentPanel: () => <div>EnrollmentPanel</div>,
}));

vi.mock("@/features/persons/components/CheckinHistoryTable", () => ({
  CheckinHistoryTable: () => <div>CheckinHistoryTable</div>,
}));

vi.mock("@/features/persons/components/detail/EditPersonModal", () => ({
  EditPersonModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="edit-modal">EditPersonModal</div> : null,
}));

// A diferencia de PersonaDetalle.test.tsx, aquí el modal NO se stubea a `null`:
// hace falta poder demostrar que el botón del escudo lo abre de verdad.
vi.mock("@/features/persons/components/ConsentModal", () => ({
  ConsentModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="consent-modal">ConsentModal</div> : null,
}));

// `Link` como ancla REAL: el mock de la otra suite lo colapsa a un fragmento y
// entonces getByRole("link") no encuentra nada.
vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof Wouter>("wouter");
  return {
    ...actual,
    useParams: () => ({ id: PERSON_ID }),
    useSearch: () => estado.search,
    useLocation: () => ["/personas/" + PERSON_ID, estado.navigate],
    Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
      <a href={href}>{children}</a>
    ),
  };
});

const PERSON_ID = "11111111-1111-1111-1111-111111111111";

import PersonaDetalle from "../PersonaDetalle";
import type { Database } from "@/lib/database.types";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

const BASE_PERSON = {
  alertas_activas: null,
  apellidos: "García",
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
  nombre: "Ana",
  nombre_norm: "ana garcia",
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
} satisfies PersonRow;

function setup({ role = "admin", isError = false }: { role?: string; isError?: boolean } = {}) {
  mockUsePersonById.mockReturnValue({
    data: isError ? undefined : BASE_PERSON,
    isLoading: false,
    isError,
    refetch: vi.fn(),
  });
  mockUseAuth.mockReturnValue({ user: { role } });
  mockCheckinUseQuery.mockReturnValue({ data: { total: 7 } });
}

beforeEach(() => {
  vi.clearAllMocks();
  estado.search = "";
});
afterEach(() => cleanup());

/** Las acciones arrancan plegadas: hay que abrir «Acciones» para alcanzarlas. */
async function abrirAcciones() {
  await userEvent.click(screen.getByRole("button", { name: "Acciones" }));
}

describe("PersonaDetalle — la barra de acciones se alcanza en cualquier ancho", () => {
  it("arranca plegada, pero el disparador se ve sin abrir nada y sin gate de ancho", () => {
    setup();
    render(<PersonaDetalle />);

    // Plegado ≠ escondido. Esta es la diferencia con el fallo original: allí no
    // había NADA que pulsar por debajo de 640px; aquí hay un control rotulado.
    const disparador = screen.getByRole("button", { name: "Acciones" });
    expect(disparador.closest('[class*="hidden"]')).toBeNull();
    expect(screen.queryByRole("link", { name: /Ver QR/i })).toBeNull();
  });

  it("un admin llega al QR de la persona", async () => {
    setup();
    render(<PersonaDetalle />);
    await abrirAcciones();

    const link = screen.getByRole("link", { name: /Ver QR/i });
    expect(link).toHaveAttribute("href", `/personas/${PERSON_ID}/qr`);
  });

  it("ningún ancestro del enlace al QR está oculto por una clase `hidden`", async () => {
    setup();
    render(<PersonaDetalle />);
    await abrirAcciones();

    // El fallo original era exactamente esto: `hidden … sm:flex` en un ancestro.
    // jsdom no evalúa media queries, así que se comprueba la estructura.
    const link = screen.getByRole("link", { name: /Ver QR/i });
    expect(link.closest('[class*="hidden"]')).toBeNull();
  });

  it("el botón de consentimientos abre el modal (era invisible en el móvil)", async () => {
    setup();
    render(<PersonaDetalle />);
    await abrirAcciones();

    expect(screen.queryByTestId("consent-modal")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Consentimientos/i }));
    expect(screen.getByTestId("consent-modal")).toBeInTheDocument();
  });

  it("las tres acciones de uso diario viven en UNA sola fila", async () => {
    setup({ role: "superadmin" });
    render(<PersonaDetalle />);
    await abrirAcciones();

    const qr = screen.getByRole("link", { name: /Ver QR/i });
    const editar = screen.getByRole("button", { name: /Editar ficha/i });
    const consent = screen.getByRole("button", { name: /Consentimientos/i });

    const fila = editar.closest("div");
    expect(fila).not.toBeNull();
    expect(qr.closest("div")).toBe(fila);
    expect(consent.closest("div")).toBe(fila);
  });

  it("«Retirar ficha» ya NO es un botón de esa fila", async () => {
    setup({ role: "superadmin" });
    render(<PersonaDetalle />);
    await abrirAcciones();

    // Un cuarto botón, del mismo tamaño y a un dedo de los otros tres, se pulsa
    // por resbalón. Ahora lo destructivo pide abrir el `⋯` primero.
    expect(screen.queryByRole("button", { name: /Retirar ficha/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Más acciones" })).toBeInTheDocument();
  });

  it("el `⋯` sigue siendo sólo de superadmin", async () => {
    setup({ role: "admin" });
    render(<PersonaDetalle />);
    await abrirAcciones();

    expect(screen.getByRole("button", { name: /Editar ficha/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Más acciones" })).toBeNull();
  });

  it("sólo la tira de tabs es pegajosa — la cabecera no", () => {
    setup();
    const { container } = render(<PersonaDetalle />);

    // Las dos eran `sticky top-0` y la cabecera ganaba por z-index: en un
    // teléfono de 812px ocupaba 396 y la tira de tabs quedaba DEBAJO, invisible
    // al primer scroll. Quien quisiera Programas o Notas tenía que subir del
    // todo. Dos hermanos pegados al mismo `top` es siempre este bug.
    const cabecera = container.querySelector("header");
    const tira = container.querySelector('[data-slot="tabs-list"]')?.closest("div.sticky");
    expect(cabecera?.className).not.toMatch(/\bsticky\b/);
    expect(tira).not.toBeNull();
  });

  it("el tab activo se subraya, no se enmarca", () => {
    setup();
    render(<PersonaDetalle />);

    // El primitivo TabsTrigger trae `border border-transparent` en los CUATRO
    // lados. `border-primary` los pintaba todos y el tab activo salía como una
    // caja roja alrededor de «Resumen». Sólo se quiere el de abajo.
    const activo = screen.getByRole("tab", { name: "Resumen" });
    expect(activo.className).toContain("data-[state=active]:border-b-primary");
    expect(activo.className).not.toMatch(/data-\[state=active\]:border-primary\b/);
  });

  it("un voluntario no llega a esta página, así que tampoco a la barra", () => {
    // `persons.getById` es adminProcedure: la consulta falla y la página se
    // queda en el estado de error. La ruta real del voluntario al QR es
    // /personas/:id/qr, adonde le manda el alta. Se fija aquí para que nadie
    // "arregle" el gate ampliándolo.
    setup({ role: "voluntario", isError: true });
    render(<PersonaDetalle />);

    expect(screen.getByText(/No se pudo cargar la ficha/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Acciones" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Ver QR/i })).toBeNull();
  });
});

/**
 * Retirar una ficha la saca del listado y de TODOS sus programas. Antes la
 * barrera era un diálogo cuyo «Sí, retirar» cuesta lo mismo que «Cancelar»: un
 * clic. Aquí se fija el precio nuevo — dos gestos y el nombre escrito.
 */
describe("Retirar ficha — no se confirma sin escribir el nombre", () => {
  async function abrirDialogo() {
    setup({ role: "superadmin" });
    render(<PersonaDetalle />);
    await abrirAcciones();
    await userEvent.click(screen.getByRole("button", { name: "Más acciones" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Retirar ficha/i }));
    return screen.getByRole("alertdialog");
  }

  it("el botón de retirar nace bloqueado", async () => {
    const dialogo = await abrirDialogo();
    expect(within(dialogo).getByRole("button", { name: "Retirar ficha" })).toBeDisabled();
  });

  it("el nombre de OTRA persona no lo desbloquea", async () => {
    const dialogo = await abrirDialogo();
    // El riesgo real no es retirar sin querer: es retirar la ficha equivocada.
    fireEvent.change(within(dialogo).getByLabelText(/Para confirmar/i), {
      target: { value: "Ana Gómez" },
    });
    expect(within(dialogo).getByRole("button", { name: "Retirar ficha" })).toBeDisabled();
  });

  it("el nombre correcto lo desbloquea, y tolera tildes y mayúsculas", async () => {
    const dialogo = await abrirDialogo();
    // La fricción tiene que ser deliberación, no mecanografía en un móvil.
    fireEvent.change(within(dialogo).getByLabelText(/Para confirmar/i), {
      target: { value: "  ANA GARCIA " },
    });
    expect(within(dialogo).getByRole("button", { name: "Retirar ficha" })).toBeEnabled();
  });
});
