/**
 * Editar la ficha — camino completo, no piezas sueltas.
 *
 * El formulario pasó de 23 a 35 campos y ganó el bloque Art. 9. Lo que hay que
 * demostrar no es que cada sección sepa pintarse, sino que se LLEGA a ellas y
 * que el parche que sale por el cable es exactamente el que se ha tocado
 * (AGENTS.md §"Test reachability, not just units"). Nada montaba
 * EditPersonModal antes de este archivo.
 *
 * El caso 6 es el que más importa: sin el candado, corregir el nombre de
 * cualquier persona con un colectivo declarado emitiría también `colectivos`,
 * el servidor exigiría el consentimiento explícito y el guardado fallaría
 * ENTERO. Es el fallo que se lleva por delante la feature en producción, no en
 * una prueba unitaria.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as Wouter from "wouter";

// Cada prueba monta la PÁGINA entera y abre un modal de ocho secciones. Con la
// suite completa en paralelo eso pasa de los 5s por defecto de vitest, y un
// test abortado a mitad de interacción dejaba un guardado PARCIAL en vuelo que
// ensuciaba el siguiente. No se está midiendo velocidad aquí: el default es
// arbitrario y este archivo hace bastante más trabajo que una prueba unitaria.
vi.setConfig({ testTimeout: 20_000 });

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
// Radix Select en jsdom.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

const { mockUsePersonById, mockUseAuth, mockCheckin, updateSpy, invalidaciones } = vi.hoisted(
  () => ({
    mockUsePersonById: vi.fn(),
    mockUseAuth: vi.fn(),
    mockCheckin: vi.fn(),
    updateSpy: vi.fn().mockResolvedValue({ id: "x" }),
    invalidaciones: {
      getById: vi.fn().mockResolvedValue(undefined),
      getAll: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue(undefined),
    },
  })
);

vi.mock("@/features/persons/hooks/usePersonById", () => ({ usePersonById: mockUsePersonById }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: mockUseAuth }));
vi.mock("@/features/persons/hooks/useConsentTemplates", () => ({
  useConsentTemplates: () => ({ data: [] }),
}));
vi.mock("@/features/programs/components/EnrollmentPanel", () => ({
  EnrollmentPanel: () => <div>EnrollmentPanel</div>,
}));
vi.mock("@/features/persons/components/CheckinHistoryTable", () => ({
  CheckinHistoryTable: () => <div>CheckinHistoryTable</div>,
}));
vi.mock("@/features/persons/components/ConsentModal", () => ({ ConsentModal: () => null }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      persons: {
        getById: { invalidate: invalidaciones.getById },
        getAll: { invalidate: invalidaciones.getAll },
        search: { invalidate: invalidaciones.search },
      },
    }),
    persons: {
      getCheckinHistory: { useQuery: mockCheckin },
      // La mutación real llama a onSuccess: así se comprueba la invalidación.
      update: {
        useMutation: (opts?: { onSuccess?: () => Promise<void> | void }) => ({
          mutateAsync: async (vars: unknown) => {
            const r = await updateSpy(vars);
            await opts?.onSuccess?.();
            return r;
          },
          isPending: false,
        }),
      },
      softDelete: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
    },
    // SeccionCanal (modal de edición) monta InstitucionTypeahead (Task 4).
    instituciones: {
      search: { useQuery: () => ({ data: [] }) },
      create: { useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }) },
    },
  },
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof Wouter>("wouter");
  return {
    ...actual,
    useParams: () => ({ id: PERSON_ID }),
    useSearch: () => "",
    useLocation: () => ["/personas/" + PERSON_ID, vi.fn()],
    Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

const PERSON_ID = "11111111-1111-1111-1111-111111111111";

import PersonaDetalle from "../PersonaDetalle";
import type { Database } from "@/lib/database.types";

type PersonRow = Database["public"]["Tables"]["persons"]["Row"];

// Ficha CON colectivo declarado y `colectivo_otros` ya descifrado, que es lo
// que getById devuelve a un llamante elevado.
const PERSON = {
  alertas_activas: null, apellidos: "García", barrio_zona: null, canal_llegada: null,
  codigo_postal: null, colectivo_otros: "texto en claro", colectivos: ["lgtbi"],
  created_at: "2023-06-01T00:00:00Z", deleted_at: null, direccion: null, distrito: null,
  email: null, empadronado: null, empresa_empleo: null, entidad_derivadora: null,
  es_retorno: null, estabilidad_habitacional: null, estado_empleo: null,
  fase_itinerario: "acogida", fecha_llegada_espana: null, fecha_nacimiento: "1990-05-01",
  foto_documento_url: null, foto_perfil_url: null, genero: null, id: PERSON_ID,
  idioma_principal: "es", idiomas: null, metadata: null, motivo_retorno: null,
  municipio: null, necesidades_principales: null, nivel_estudios: null, nivel_ingresos: null,
  nombre: "Ana", nombre_norm: "ana garcia", notas_privadas: null, numero_documento: null,
  observaciones: null, pais_documento: null, pais_origen: null, persona_referencia: null,
  recorrido_migratorio: null, restricciones_alimentarias: null, role: "beneficiario",
  situacion_ante_empleo: null, situacion_laboral: null, situacion_legal: null,
  telefono: null, tipo_documento: null, tipo_vivienda: null,
  updated_at: "2023-06-01T00:00:00Z",
} satisfies PersonRow;

function setup(role = "admin") {
  mockUsePersonById.mockReturnValue({
    data: PERSON, isLoading: false, isError: false, refetch: vi.fn(),
  });
  mockUseAuth.mockReturnValue({ user: { role } });
  mockCheckin.mockReturnValue({ data: { total: 7 } });
}

/** Escribe de una vez: el tecleo carácter a carácter es lo que hacía flaky. */
function escribir(campo: HTMLElement, valor: string) {
  fireEvent.change(campo, { target: { value: valor } });
}

async function abrirEditor() {
  // Las acciones viven plegadas dentro de la cabecera desde el rediseño de la
  // barra: primero el desplegable, luego el botón.
  await userEvent.click(screen.getByRole("button", { name: "Acciones" }));
  await userEvent.click(screen.getByRole("button", { name: /Editar ficha/i }));
  return screen.getByRole("dialog");
}

beforeEach(() => {
  vi.clearAllMocks();
  updateSpy.mockResolvedValue({ id: "x" });
});
afterEach(() => cleanup());

describe("Editar ficha — se llega a todas las secciones", () => {
  it("el botón abre el editor y están las ocho secciones", async () => {
    setup();
    render(<PersonaDetalle />);
    const dialogo = await abrirEditor();

    for (const titulo of [
      "Identidad", "Documento", "Contacto", "Vivienda",
      "Situación", "Información social", "Canal de llegada",
    ]) {
      expect(within(dialogo).getByRole("heading", { name: titulo })).toBeInTheDocument();
    }
    // Por el fieldset, no por el texto: la descripción del diálogo también
    // menciona los datos de colectivo.
    expect(
      within(dialogo).getByRole("group", { name: /Datos de colectivo/i })
    ).toBeInTheDocument();
  });

  it("los campos que antes no se podían corregir están presentes", async () => {
    setup();
    render(<PersonaDetalle />);
    const dialogo = await abrirEditor();

    // Los diez que el servidor aceptaba y ninguna pantalla ofrecía.
    for (const label of [
      /Entidad derivadora/i, /Persona de referencia/i,
      /Estabilidad habitacional/i, /Necesidades principales/i,
      /Restricciones alimentarias/i, /Observaciones/i, /Recorrido migratorio/i,
      /Notas privadas/i,
    ]) {
      expect(within(dialogo).getByLabelText(label)).toBeInTheDocument();
    }
    // Grupo de casillas: fieldset + legend, no un input suelto.
    expect(within(dialogo).getByRole("group", { name: /Otros idiomas/i })).toBeInTheDocument();
  });

  it("manda SÓLO lo tocado", async () => {
    setup();
    render(<PersonaDetalle />);
    const dialogo = await abrirEditor();

    escribir(within(dialogo).getByLabelText(/Entidad derivadora/i), "Cruz Roja");
    escribir(within(dialogo).getByLabelText(/Observaciones/i), "Nota");
    await userEvent.click(within(dialogo).getByRole("button", { name: /Guardar cambios/i }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy).toHaveBeenCalledWith({
      id: PERSON_ID,
      data: { entidad_derivadora: "Cruz Roja", observaciones: "Nota" },
    });
  });

  it("sin cambios no se llama al servidor", async () => {
    setup();
    render(<PersonaDetalle />);
    const dialogo = await abrirEditor();
    await userEvent.click(within(dialogo).getByRole("button", { name: /Guardar cambios/i }));
    await new Promise((r) => setTimeout(r, 0));
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("al guardar se invalidan las tres cachés", async () => {
    setup();
    render(<PersonaDetalle />);
    const dialogo = await abrirEditor();

    escribir(within(dialogo).getByLabelText(/Municipio/i), "Madrid");
    await userEvent.click(within(dialogo).getByRole("button", { name: /Guardar cambios/i }));

    // Sin esto, el listado enseña el dato viejo hasta un minuto — y
    // persons.search sirve el aviso de alergia que lee el comedor.
    await waitFor(() => expect(invalidaciones.getById).toHaveBeenCalledWith({ id: PERSON_ID }));
    expect(invalidaciones.getAll).toHaveBeenCalled();
    expect(invalidaciones.search).toHaveBeenCalled();
  });
});

describe("Editar ficha — candado Art. 9", () => {
  it("los datos de colectivo se VEN pero no se pueden escribir", async () => {
    setup();
    render(<PersonaDetalle />);
    const dialogo = await abrirEditor();

    expect(within(dialogo).getByLabelText("LGTBI")).toBeChecked();
    expect(within(dialogo).getByLabelText("LGTBI")).toBeDisabled();
    expect(within(dialogo).getByLabelText(/Otros \(especificar\)/i)).toBeDisabled();
  });

  it("la declaración de consentimiento sólo aparece al abrir el candado", async () => {
    setup();
    render(<PersonaDetalle />);
    const dialogo = await abrirEditor();

    expect(within(dialogo).queryByLabelText(/consiente explícitamente/i)).toBeNull();
    await userEvent.click(within(dialogo).getByLabelText(/Editar los datos de colectivo/i));
    expect(within(dialogo).getByLabelText(/consiente explícitamente/i)).toBeInTheDocument();
  });

  it("EL CASO CLAVE: cambiar sólo el nombre de alguien con colectivo no lo arrastra", async () => {
    setup();
    render(<PersonaDetalle />);
    const dialogo = await abrirEditor();

    escribir(within(dialogo).getByLabelText("Nombre"), "Ana María");
    await userEvent.click(within(dialogo).getByRole("button", { name: /Guardar cambios/i }));

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith({ id: PERSON_ID, data: { nombre: "Ana María" } })
    );
    const [[{ data }]] = updateSpy.mock.calls as [[{ data: Record<string, unknown> }]];
    expect(data).not.toHaveProperty("colectivos");
    expect(data).not.toHaveProperty("colectivo_consentimiento");
  });

  it("tocar colectivos sin declarar el consentimiento NO llega al servidor", async () => {
    setup();
    render(<PersonaDetalle />);
    const dialogo = await abrirEditor();

    await userEvent.click(within(dialogo).getByLabelText(/Editar los datos de colectivo/i));
    await userEvent.click(within(dialogo).getByLabelText("Población gitana"));
    await userEvent.click(within(dialogo).getByRole("button", { name: /Guardar cambios/i }));

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("con la declaración marcada sí viaja, y con el flag", async () => {
    setup();
    render(<PersonaDetalle />);
    const dialogo = await abrirEditor();

    await userEvent.click(within(dialogo).getByLabelText(/Editar los datos de colectivo/i));
    await userEvent.click(within(dialogo).getByLabelText("Población gitana"));
    await userEvent.click(within(dialogo).getByLabelText(/consiente explícitamente/i));
    await userEvent.click(within(dialogo).getByRole("button", { name: /Guardar cambios/i }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    const [[{ data }]] = updateSpy.mock.calls as [[{ data: Record<string, unknown> }]];
    // Orden canónico del mapa de etiquetas, no orden de clic.
    expect(data.colectivos).toEqual(["gitanos", "lgtbi"]);
    expect(data.colectivo_consentimiento).toBe(true);
  });
});

describe("Editar ficha — lápices del Resumen", () => {
  it("cada bloque del Resumen abre el editor", async () => {
    setup();
    render(<PersonaDetalle />);

    await userEvent.click(screen.getByRole("button", { name: /Editar datos de contacto/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("un no-admin no ve ni el botón ni los lápices", () => {
    setup("voluntario");
    render(<PersonaDetalle />);

    // Sin acciones, PersonaHeader no pinta ni el desplegable.
    expect(screen.queryByRole("button", { name: "Acciones" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar ficha/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar datos de contacto/i })).toBeNull();
  });
});
