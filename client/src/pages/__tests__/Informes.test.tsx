/**
 * Informes.test.tsx — la sección «Informes» de la barra lateral NO es un
 * módulo nuevo: monta el reports-tab que YA existe, y lo monta SIN
 * programaId (aquí no se mira un programa, se mira la entidad entera).
 *
 * Lo que se bloquea aquí: que alguien "arregle" la página duplicando el
 * TemplatesGrid, y que le cuele el programaId del programa de familias y
 * las consultas guardadas salgan filtradas en silencio.
 *
 * El diálogo de consentimiento NO se mockea: se comprueba que la página lo
 * monta de verdad (el trpc sí está mockeado).
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

let lastReportsTabProps: Record<string, unknown> | null = null;

vi.mock("@/features/reports-tab", () => ({
  default: (props: { currentUserId: string; programaId?: string }) => {
    lastReportsTabProps = props as unknown as Record<string, unknown>;
    return <div data-testid="reports-tab-mock" />;
  },
}));

const { mockUseAuth, mockCheckConsentUseQuery } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockCheckConsentUseQuery: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: mockUseAuth }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    persons: {
      checkConsentByNames: { useQuery: mockCheckConsentUseQuery },
    },
  },
}));

import Informes from "@/pages/Informes";

afterEach(() => {
  cleanup();
  lastReportsTabProps = null;
  vi.clearAllMocks();
});

function arm() {
  mockUseAuth.mockReturnValue({ user: { id: "u1", role: "admin" } });
  mockCheckConsentUseQuery.mockReturnValue({ data: undefined, isFetching: false });
}

describe("Informes — la casa de los informes en la barra lateral", () => {
  it("monta el reports-tab que ya existe, con el autor y SIN programaId", () => {
    arm();
    render(<Informes />);

    expect(screen.getByTestId("reports-tab-mock")).toBeInTheDocument();
    expect(lastReportsTabProps).toEqual({ currentUserId: "u1" });
  });

  it("el título de la página es «Informes»", () => {
    arm();
    render(<Informes />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Informes" })
    ).toBeInTheDocument();
  });

  it("ofrece la comprobación de consentimiento de imagen", () => {
    arm();
    render(<Informes />);

    expect(
      screen.getByRole("button", { name: /Comprobar consentimiento de imagen/i })
    ).toBeInTheDocument();
  });
});
