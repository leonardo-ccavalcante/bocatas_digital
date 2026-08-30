/**
 * PersonaQR.roles.test.tsx — RC-07 (F054).
 * /personas/:id/qr debe alimentarse SOLO de persons.getQrPayload
 * (voluntarioProcedure) — nunca de persons.getById (adminProcedure), que
 * dejaba a los voluntarios sin tarjeta QR tras registrar a una persona.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const { mockGetQrPayloadUseQuery, mockGetByIdUseQuery } = vi.hoisted(() => ({
  mockGetQrPayloadUseQuery: vi.fn(),
  mockGetByIdUseQuery: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    persons: {
      getQrPayload: { useQuery: mockGetQrPayloadUseQuery },
      getById: { useQuery: mockGetByIdUseQuery },
    },
  },
}));

vi.mock("wouter", async () => {
  const real = await vi.importActual<typeof import("wouter")>("wouter"); // eslint-disable-line @typescript-eslint/consistent-type-imports
  return {
    ...real,
    useParams: () => ({ id: "12345678-1234-1234-1234-1234567890ab" }),
  };
});

vi.mock("@/features/persons/components/QRCodeCard", () => ({
  QRCodeCard: ({ person }: { person: { id: string; nombre: string; apellidos: string | null } }) => (
    <div data-testid="qr-card">{person.nombre} {person.apellidos}</div>
  ),
}));

import PersonaQR from "@/pages/PersonaQR";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("PersonaQR — fuente de datos voluntario-safe", () => {
  it("renderiza la tarjeta desde getQrPayload sin llamar a persons.getById", () => {
    mockGetQrPayloadUseQuery.mockReturnValue({
      data: {
        payload: "bocatas://person/12345678-1234-1234-1234-1234567890ab?sig=aaaaaaaa",
        nombre: "Ana",
        apellidos: "García",
      },
      isLoading: false,
      isError: false,
    });
    mockGetByIdUseQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    render(<PersonaQR />);

    expect(screen.getByTestId("qr-card")).toHaveTextContent("Ana García");
    expect(mockGetByIdUseQuery).not.toHaveBeenCalled();
  });
});
