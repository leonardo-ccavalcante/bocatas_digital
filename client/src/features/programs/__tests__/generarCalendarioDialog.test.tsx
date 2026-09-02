/**
 * generarCalendarioDialog.test.tsx — el modal de «Generar calendario».
 *
 * Contratos:
 *  1. La previsualización dice cuántas sesiones y de qué fecha a qué fecha,
 *     ANTES de confirmar (generar es irreversible en la práctica).
 *  2. No se genera sin ubicación, sin ninguna franja, o con hora_fin <= hora_inicio.
 *  3. Al confirmar: primero programs.update, DESPUÉS generarSesiones.
 *  4. Si el guardado falla, generarSesiones NO se llama.
 *  5. Reabrir el modal muestra la configuración ya guardada.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

if (!global.PointerEvent) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type: string, init?: PointerEventInit) { super(type, init); }
  };
}

const {
  mockGetAll, mockGetLocations, mockUpdateAsync, mockGenerarAsync,
  mockInvalidateSesiones, mockInvalidateProgramas,
} = vi.hoisted(() => ({
  mockGetAll: vi.fn(),
  mockGetLocations: vi.fn(),
  mockUpdateAsync: vi.fn(),
  mockGenerarAsync: vi.fn(),
  mockInvalidateSesiones: vi.fn(),
  mockInvalidateProgramas: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    programs: {
      getAll: { useQuery: mockGetAll },
      update: { useMutation: () => ({ mutateAsync: mockUpdateAsync, isPending: false }) },
      sessions: {
        generarSesiones: {
          useMutation: () => ({ mutateAsync: mockGenerarAsync, isPending: false }),
        },
      },
    },
    checkin: { getLocations: { useQuery: mockGetLocations } },
    useUtils: () => ({
      programs: {
        sessions: { listSesiones: { invalidate: mockInvalidateSesiones } },
        getAll: { invalidate: mockInvalidateProgramas },
      },
    }),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { GenerarCalendarioDialog } from "../components/sessions/GenerarCalendarioDialog";

const PROGRAM_ID = "11111111-2222-3333-4444-555555555555";
const SEDE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function programa(config: Record<string, unknown>) {
  return {
    id: PROGRAM_ID, slug: "2026_09_coc", name: "Cocina · septiembre 2026",
    fecha_inicio: "2026-09-07", fecha_fin: "2026-09-18", config,
  };
}

const DOS_FRANJAS = {
  location_id: SEDE,
  programacion: [
    { dia_semana: 1, hora_inicio: "09:00", hora_fin: "13:00" },
    { dia_semana: 3, hora_inicio: "16:00", hora_fin: "20:00" },
  ],
};

function renderModal(config: Record<string, unknown>, fechasExistentes: string[] = []) {
  mockGetAll.mockReturnValue({ data: [programa(config)] });
  mockGetLocations.mockReturnValue({
    data: [
      { id: SEDE, nombre: "Comedor Bocatas - Sede Central", tipo: "sede" },
      { id: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff", nombre: "La Canada", tipo: "sede" },
    ],
  });
  return render(
    <GenerarCalendarioDialog
      open
      onOpenChange={vi.fn()}
      programId={PROGRAM_ID}
      fechasExistentes={fechasExistentes}
    />
  );
}

beforeEach(() => { vi.clearAllMocks(); mockUpdateAsync.mockResolvedValue({}); mockGenerarAsync.mockResolvedValue({ created: 4, skipped: 0 }); });
afterEach(() => { cleanup(); });

describe("GenerarCalendarioDialog — previsualización antes de confirmar", () => {
  it("dice cuántas sesiones y de qué fecha a qué fecha", () => {
    renderModal(DOS_FRANJAS);
    const preview = screen.getByTestId("calendario-preview");
    expect(preview.textContent).toContain("Se crearán 4 sesiones");
    expect(preview.textContent).toContain("2026-09-07");
    expect(preview.textContent).toContain("2026-09-16");
  });

  it("descuenta las fechas que ya tienen sesión", () => {
    renderModal(DOS_FRANJAS, ["2026-09-07", "2026-09-09"]);
    const preview = screen.getByTestId("calendario-preview");
    expect(preview.textContent).toContain("Se crearán 2 sesiones");
    expect(preview.textContent).toContain("2 fechas ya tienen sesión");
  });

  it("reabrir el modal muestra la configuración ya guardada", () => {
    renderModal(DOS_FRANJAS);
    expect(document.body.querySelector<HTMLSelectElement>("#calendario-ubicacion")!.value).toBe(SEDE);
    expect(document.body.querySelector<HTMLInputElement>("#calendario-desde")!.value).toBe("2026-09-07");
    expect(document.body.querySelector<HTMLSelectElement>("#franja-0-dia")!.value).toBe("1");
    expect(document.body.querySelector<HTMLInputElement>("#franja-1-inicio")!.value).toBe("16:00");
  });
});

describe("GenerarCalendarioDialog — validación", () => {
  it("no genera sin ubicación", async () => {
    renderModal({ programacion: DOS_FRANJAS.programacion });
    fireEvent.click(screen.getByRole("button", { name: /guardar y generar/i }));
    // El matcher evita el <option> placeholder («Selecciona una ubicación…»):
    // el error de validación es el único texto con la coletilla de pasar lista.
    expect(
      await screen.findByText(/sin ella no se puede pasar lista/i)
    ).toBeInTheDocument();
    expect(mockUpdateAsync).not.toHaveBeenCalled();
    expect(mockGenerarAsync).not.toHaveBeenCalled();
  });

  it("no genera con hora de fin anterior a la de inicio", async () => {
    renderModal(DOS_FRANJAS);
    fireEvent.change(document.body.querySelector("#franja-0-fin")!, { target: { value: "08:00" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar y generar/i }));
    expect(await screen.findByText(/debe ser posterior a la de inicio/i)).toBeInTheDocument();
    expect(mockUpdateAsync).not.toHaveBeenCalled();
  });

  it("no genera si se quitan todas las franjas", async () => {
    renderModal(DOS_FRANJAS);
    const quitar = screen.getAllByRole("button", { name: /quitar/i });
    fireEvent.click(quitar[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /quitar/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /guardar y generar/i }));
    expect(await screen.findByText(/Añade al menos un día de clase/i)).toBeInTheDocument();
    expect(mockUpdateAsync).not.toHaveBeenCalled();
  });
});

describe("GenerarCalendarioDialog — orden guardar → generar", () => {
  it("guarda la configuración y sólo entonces genera", async () => {
    renderModal(DOS_FRANJAS);
    fireEvent.click(screen.getByRole("button", { name: /guardar y generar/i }));

    await waitFor(() => expect(mockGenerarAsync).toHaveBeenCalled());
    expect(mockUpdateAsync).toHaveBeenCalledWith({
      id: PROGRAM_ID,
      data: {
        fecha_inicio: "2026-09-07",
        fecha_fin: "2026-09-18",
        config: {
          location_id: SEDE,
          programacion: DOS_FRANJAS.programacion,
        },
      },
    });
    expect(mockGenerarAsync).toHaveBeenCalledWith({
      programId: PROGRAM_ID, desde: "2026-09-07", hasta: "2026-09-18",
    });
    expect(mockUpdateAsync.mock.invocationCallOrder[0])
      .toBeLessThan(mockGenerarAsync.mock.invocationCallOrder[0]);
  });

  it("conserva las demás claves de config al guardar", async () => {
    renderModal({ ...DOS_FRANJAS, notion_page: "abc" });
    fireEvent.click(screen.getByRole("button", { name: /guardar y generar/i }));
    await waitFor(() => expect(mockUpdateAsync).toHaveBeenCalled());
    expect(mockUpdateAsync.mock.calls[0][0].data.config.notion_page).toBe("abc");
  });

  it("si el guardado falla, NO llama a generarSesiones", async () => {
    mockUpdateAsync.mockRejectedValue(new Error("permiso denegado"));
    renderModal(DOS_FRANJAS);
    fireEvent.click(screen.getByRole("button", { name: /guardar y generar/i }));
    await waitFor(() => expect(mockUpdateAsync).toHaveBeenCalled());
    expect(mockGenerarAsync).not.toHaveBeenCalled();
  });
});
