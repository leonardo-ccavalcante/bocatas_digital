/**
 * FamiliasEntregas.forbidden.test.tsx — RC-07 (F108/F191).
 * families.getAll es adminProcedure: cuando devuelve FORBIDDEN a un voluntario
 * la página debe decirlo en español, no fingir "No hay familias activas registradas."
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

const { mockFamiliesGetAllUseQuery } = vi.hoisted(() => ({
  mockFamiliesGetAllUseQuery: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    families: { getAll: { useQuery: mockFamiliesGetAllUseQuery } },
    entregas: {
      getDeliveries: { useQuery: () => ({ data: undefined, isLoading: false }) },
      createDelivery: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
    },
  },
}));

import FamiliasEntregas from "@/pages/FamiliasEntregas";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("FamiliasEntregas — FORBIDDEN visible", () => {
  it("voluntario sin permiso ve el mensaje de permisos, no el vacío engañoso", () => {
    mockFamiliesGetAllUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: "forbidden", data: { code: "FORBIDDEN" } },
      refetch: vi.fn(),
    });

    render(<FamiliasEntregas />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No tienes permiso para ver la lista de familias",
    );
    expect(screen.queryByText("No hay familias activas registradas.")).toBeNull();
  });

  it("otros errores muestran mensaje genérico con Reintentar", () => {
    const refetch = vi.fn();
    mockFamiliesGetAllUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: "boom", data: { code: "INTERNAL_SERVER_ERROR" } },
      refetch,
    });

    render(<FamiliasEntregas />);

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar la lista de familias");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalled();
  });
});
