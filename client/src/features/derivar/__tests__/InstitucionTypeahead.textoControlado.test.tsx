/**
 * Modo texto-controlado de <InstitucionTypeahead /> — props nuevas `text` +
 * `onTextChange` (reunión 31-08): el alta/edición de personas guarda texto
 * libre en el TEXT entidad_derivadora y el typeahead sólo asiste. Sin estas
 * props el comportamiento es el de siempre (pinado en
 * InstitucionTypeahead.test.tsx — Iron Law: fix the component, never the test).
 */
import React, { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const { mockSearch, mockCreate } = vi.hoisted(() => ({
  mockSearch: vi.fn(),
  mockCreate: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    instituciones: {
      search: { useQuery: mockSearch },
      create: { useMutation: mockCreate },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { InstitucionTypeahead } from "../InstitucionTypeahead";
import type { InstitucionPickedItem } from "../CrearInstitucionInlineModal";

const CRUZ_ROJA = {
  id: "inst-1", nombre: "Cruz Roja Madrid", tipo: "ong", areas: ["salud"],
  direccion: null, telefono: null, email: null, codigo_postal: null,
  distrito: null, notas: null, is_active: true,
};

function Harness({ alTeclear }: { alTeclear: (t: string) => void }) {
  const [texto, setTexto] = useState("");
  const [sel, setSel] = useState<InstitucionPickedItem | null>(null);
  return (
    <InstitucionTypeahead
      value={sel}
      onChange={setSel}
      text={texto}
      onTextChange={(t) => { setTexto(t); alTeclear(t); }}
    />
  );
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function armarMocks(resultados: unknown[] = []) {
  mockSearch.mockReturnValue({ data: resultados });
  mockCreate.mockReturnValue({ isPending: false, mutateAsync: vi.fn() });
}

describe("InstitucionTypeahead — texto controlado", () => {
  it("`text` controla el input y `onTextChange` notifica cada tecla", async () => {
    armarMocks([]);
    const alTeclear = vi.fn();
    const user = userEvent.setup();
    render(<Harness alTeclear={alTeclear} />);
    const input = screen.getByPlaceholderText("Buscar institución...");
    await user.type(input, "Cáritas");
    expect((input as HTMLInputElement).value).toBe("Cáritas");
    expect(alTeclear).toHaveBeenLastCalledWith("Cáritas");
  });

  it("elegir un resultado notifica el nombre elegido", async () => {
    armarMocks([CRUZ_ROJA]);
    const alTeclear = vi.fn();
    const user = userEvent.setup();
    render(<Harness alTeclear={alTeclear} />);
    await user.type(screen.getByPlaceholderText("Buscar institución..."), "Cruz");
    await user.click(await screen.findByText("Cruz Roja Madrid"));
    expect(alTeclear).toHaveBeenLastCalledWith("Cruz Roja Madrid");
    expect(
      (screen.getByPlaceholderText("Buscar institución...") as HTMLInputElement).value
    ).toBe("Cruz Roja Madrid");
  });

  it("sin `text` sigue siendo no controlado (compatibilidad derivar)", async () => {
    armarMocks([]);
    const user = userEvent.setup();
    render(<InstitucionTypeahead value={null} onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText("Buscar institución...");
    await user.type(input, "SAMUR");
    expect((input as HTMLInputElement).value).toBe("SAMUR");
  });
});
