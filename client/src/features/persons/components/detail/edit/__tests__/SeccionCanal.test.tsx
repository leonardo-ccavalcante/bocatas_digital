/**
 * SeccionCanal.test.tsx — edición del canal (reunión 31-08).
 *
 * - «Motivo del retorno» sólo se ofrece con canal retorno_bocatas y emite
 *   onChange("motivo_retorno", …).
 * - La entidad derivadora usa el typeahead del catálogo en modo
 *   texto-controlado: se siembra con el valor guardado y cada edición emite
 *   onChange("entidad_derivadora", …) — se sigue guardando TEXT.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

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

import { SeccionCanal } from "../SeccionCanal";
import type { EditableValues } from "../editableFields";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function montar(values: EditableValues) {
  mockSearch.mockReturnValue({ data: [] });
  mockCreate.mockReturnValue({ isPending: false, mutateAsync: vi.fn() });
  const onChange = vi.fn();
  render(<SeccionCanal values={values} onChange={onChange} isAdmin={false} />);
  return onChange;
}

describe("SeccionCanal — motivo del retorno", () => {
  it("no se ofrece con otro canal", () => {
    montar({ canal_llegada: "cruz_roja" });
    expect(screen.queryByLabelText("Motivo del retorno")).toBeNull();
  });

  it("con canal «Bocatas» edita motivo_retorno", () => {
    const onChange = montar({
      canal_llegada: "retorno_bocatas",
      motivo_retorno: "texto viejo",
    });
    const area = screen.getByLabelText("Motivo del retorno");
    fireEvent.change(area, { target: { value: "Vuelve por la situación de vivienda" } });
    expect(onChange).toHaveBeenCalledWith(
      "motivo_retorno",
      "Vuelve por la situación de vivienda"
    );
  });
});

describe("SeccionCanal — entidad derivadora", () => {
  it("siembra el typeahead con el texto guardado y emite las ediciones", () => {
    const onChange = montar({ canal_llegada: "cruz_roja", entidad_derivadora: "Cruz Roja" });
    const input = screen.getByPlaceholderText("Buscar institución...");
    expect((input as HTMLInputElement).value).toBe("Cruz Roja");
    fireEvent.change(input, { target: { value: "Cáritas Madrid" } });
    expect(onChange).toHaveBeenCalledWith("entidad_derivadora", "Cáritas Madrid");
  });
});
