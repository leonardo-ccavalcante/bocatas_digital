/**
 * RepartoTab.roles.test.tsx — RC-07 (F191).
 * El cierre por turno es voluntario-safe en el servidor (rounds-closeout.ts:
 * getSlotRoster/markAttendance son voluntarioProcedure), pero crear/eliminar/
 * cerrar reparto, cerrar turno, Contacto, Documentos y el acta firmada son
 * adminProcedure: la UI no debe ofrecérselos a voluntarios.
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

vi.mock("@/features/familias-reparto/hooks/useReparto", () => ({
  useRepartos: () => ({
    data: [{ id: "r1", nombre: "Reparto Mayo", estado: "activa", fecha_inicio: "2026-05-01" }],
    isLoading: false,
  }),
  useListSlots: () => ({
    data: [{ id: "s1", slot_date: "2026-05-02", turno: "manana", estado: "abierto", signed_acta: null }],
  }),
  useCerrarTurno: () => ({ mutate: vi.fn(), isPending: false }),
  useCloseReparto: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteReparto: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/features/familias-reparto/components/CrearRepartoForm", () => ({
  CrearRepartoForm: () => <div data-testid="crear-reparto-form" />,
}));
vi.mock("@/features/familias-reparto/components/RepartoPreview", () => ({
  RepartoPreview: () => <div data-testid="reparto-preview" />,
}));
vi.mock("@/features/familias-reparto/components/CloseoutDayView", () => ({
  CloseoutDayView: () => <div data-testid="closeout-day-view" />,
}));
vi.mock("@/features/familias-reparto/components/RepartoActaPrint", () => ({
  RepartoActaPrint: () => null,
}));
vi.mock("@/features/familias-reparto/components/ContactoPanel", () => ({
  ContactoPanel: () => null,
}));
vi.mock("@/features/familias-reparto/components/SignedActaUpload", () => ({
  SignedActaUpload: () => <div data-testid="signed-acta-upload" />,
}));
vi.mock("@/features/familias-reparto/components/ActaCloseoutReview", () => ({
  ActaCloseoutReview: () => null,
}));

import { RepartoTab } from "@/features/familias-reparto/components/RepartoTab";

afterEach(cleanup);

function openReparto() {
  fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
}

describe("RepartoTab — acciones por rol", () => {
  it("voluntario: sin 'Generar lista' ni 'Eliminar' en la lista", () => {
    render(<RepartoTab programId="p1" isAdmin={false} />);
    expect(screen.queryByRole("button", { name: /Generar lista/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Abrir" })).toBeInTheDocument();
  });

  it("voluntario: dentro del reparto ve el cierre por día pero no las acciones admin", () => {
    render(<RepartoTab programId="p1" isAdmin={false} />);
    openReparto();

    expect(screen.getByTestId("closeout-day-view")).toBeInTheDocument();
    expect(screen.queryByText("Contacto")).toBeNull();
    expect(screen.queryByText("Documentos del reparto")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cerrar reparto" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Cerrar turno/ })).toBeNull();
    expect(screen.queryByTestId("signed-acta-upload")).toBeNull();
  });

  it("admin: conserva todas las acciones", () => {
    render(<RepartoTab programId="p1" isAdmin={true} />);
    expect(screen.getByRole("button", { name: /Generar lista/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();

    openReparto();
    expect(screen.getByText("Contacto")).toBeInTheDocument();
    expect(screen.getByText("Documentos del reparto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar reparto" })).toBeInTheDocument();
    expect(screen.getByTestId("signed-acta-upload")).toBeInTheDocument();
  });
});
