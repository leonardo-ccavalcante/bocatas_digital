/**
 * FAMILIAS-7 (causa de fondo) — el escudo no es un visor de consentimientos.
 *
 * El modal arrancaba SIEMPRE con el estado vacío: las casillas salían
 * desmarcadas aunque la persona ya hubiera firmado, porque nadie leía la tabla
 * `consents`. Este test fija el contrato de siembra:
 *
 *  - un consentimiento otorgado y no revocado → casilla marcada, con su fecha
 *    de firma y su versión visibles (el equipo necesita saber QUÉ firmó y
 *    CUÁNDO, no sólo que "algo" hay);
 *  - un consentimiento revocado → casilla desmarcada y marca de revocación;
 *  - "Guardar" no debe re-sellar con la fecha de hoy lo que ya estaba firmado
 *    (el registro es equivalente a una firma manuscrita: su fecha no se toca).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ConsentTemplate } from "../schemas";

// Radix ScrollArea observa el viewport en cuanto monta; jsdom no trae
// ResizeObserver.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

interface UpsertRow {
  purpose: string;
  granted_at: string;
}

const { upsertMock, mockUseQuery } = vi.hoisted(() => ({
  upsertMock: vi.fn((_rows: unknown) => Promise.resolve({ error: null })),
  mockUseQuery: vi.fn(),
}));

// El cliente supabase de navegador revienta en carga si faltan las VITE_*.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn() }) },
    from: () => ({ upsert: upsertMock }),
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: { persons: { getPersonConsents: { useQuery: mockUseQuery } } },
}));

import { ConsentModal } from "../components/ConsentModal";

const PERSON_ID = "11111111-1111-1111-1111-111111111111";

const TEMPLATES: ConsentTemplate[] = [
  {
    id: "22222222-2222-2222-2222-222222222222",
    purpose: "tratamiento_datos_bocatas",
    idioma: "es",
    version: "1.2",
    text_content: "Acepto el tratamiento de mis datos personales por Bocatas.",
    is_active: true,
    updated_at: null,
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    purpose: "fotografia",
    idioma: "es",
    version: "1.0",
    text_content: "Autorizo el uso de mi imagen en materiales de la asociación.",
    is_active: true,
    updated_at: null,
  },
];

interface SavedConsent {
  purpose: string;
  granted: boolean;
  granted_at: string | null;
  idioma: string;
  consent_version: string;
  revoked_at: string | null;
}

function renderModal(saved: SavedConsent[]) {
  mockUseQuery.mockReturnValue({ data: saved, isLoading: false, isError: false });
  render(
    <ConsentModal
      open
      personId={PERSON_ID}
      templates={TEMPLATES}
      personLanguage="es"
      onClose={() => {}}
      onSaved={() => {}}
    />,
  );
}

const FIRMADO: SavedConsent = {
  purpose: "tratamiento_datos_bocatas",
  granted: true,
  granted_at: "2026-03-12T10:00:00Z",
  idioma: "es",
  consent_version: "1.2",
  revoked_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  upsertMock.mockResolvedValue({ error: null });
});

afterEach(() => cleanup());

describe("ConsentModal — siembra con los consentimientos ya firmados", () => {
  it("marca la casilla de un consentimiento otorgado", async () => {
    renderModal([FIRMADO]);
    const bocatas = await screen.findByRole("checkbox", {
      name: /Tratamiento de datos — Bocatas/,
    });
    expect(bocatas).toBeChecked();
  });

  it("deja desmarcado lo que la persona no ha firmado", async () => {
    renderModal([FIRMADO]);
    const foto = await screen.findByRole("checkbox", { name: /Uso de fotografía/ });
    expect(foto).not.toBeChecked();
  });

  it("muestra la fecha de firma y la versión aceptada", async () => {
    renderModal([FIRMADO]);
    const firma = await screen.findByTestId("consent-firma-tratamiento_datos_bocatas");
    expect(firma).toHaveTextContent("12/03/2026");
    expect(firma).toHaveTextContent("v1.2");
  });

  it("un consentimiento revocado no cuenta como otorgado", async () => {
    renderModal([{ ...FIRMADO, revoked_at: "2026-04-20T09:00:00Z" }]);
    const bocatas = await screen.findByRole("checkbox", {
      name: /Tratamiento de datos — Bocatas/,
    });
    expect(bocatas).not.toBeChecked();
    expect(
      await screen.findByTestId("consent-firma-tratamiento_datos_bocatas"),
    ).toHaveTextContent(/Revocado/);
  });

  it("sin consentimientos guardados arranca vacío (sin datos inventados)", async () => {
    renderModal([]);
    const bocatas = await screen.findByRole("checkbox", {
      name: /Tratamiento de datos — Bocatas/,
    });
    expect(bocatas).not.toBeChecked();
    expect(
      screen.queryByTestId("consent-firma-tratamiento_datos_bocatas"),
    ).not.toBeInTheDocument();
  });

  it("avisa cuando no ha podido leer lo ya firmado en vez de fingir que no hay nada", async () => {
    // Caso real: un voluntario abre el escudo y el guard admin devuelve
    // FORBIDDEN. Sin aviso, las casillas vacías invitan a volver a firmar.
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(
      <ConsentModal
        open
        personId={PERSON_ID}
        templates={TEMPLATES}
        personLanguage="es"
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    expect(await screen.findByTestId("consent-carga-fallida")).toBeInTheDocument();
  });

  it("Guardar no re-sella con la fecha de hoy un consentimiento ya firmado", async () => {
    renderModal([FIRMADO]);
    await screen.findByRole("checkbox", { name: /Tratamiento de datos — Bocatas/ });

    await userEvent.click(
      screen.getByRole("button", { name: /Guardar consentimientos/ }),
    );

    await waitFor(() => expect(upsertMock).not.toHaveBeenCalled());
  });

  it("Guardar sí persiste un consentimiento nuevo marcado en el momento", async () => {
    renderModal([FIRMADO]);
    await userEvent.click(
      await screen.findByRole("checkbox", { name: /Uso de fotografía/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Guardar consentimientos/ }),
    );

    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1));
    const rows = upsertMock.mock.calls[0][0] as UpsertRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0].purpose).toBe("fotografia");
  });
});
