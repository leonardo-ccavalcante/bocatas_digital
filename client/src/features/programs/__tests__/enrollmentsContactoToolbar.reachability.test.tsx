/**
 * Reachability de la toolbar de contacto (AGENTS.md: «test reachability, not
 * just units»): un test del util no prueba que la tabla la monte de verdad.
 * Aquí se monta EnrolledPersonsTable con datos y se comprueba que los botones
 * de copiar aparecen para admin y NO para un no-admin.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const ENROLLMENTS = [
  {
    id: "e1",
    estado: "activo",
    fecha_inicio: "2026-09-01",
    fecha_fin: null,
    notas: null,
    created_at: "2026-09-01T00:00:00Z",
    persons: {
      id: "p1",
      nombre: "Ana",
      apellidos: "García",
      foto_perfil_url: null,
      restricciones_alimentarias: null,
      email: "ana@example.org",
      telefono: "600111222",
      puede_whatsapp: true,
    },
  },
];

vi.mock("../hooks/useEnrollment", () => ({
  useEnrollments: () => ({ enrollments: ENROLLMENTS, total: 1, isLoading: false }),
  // BulkEstadoBar (Task 12) también se monta bajo la tabla para admin.
  useUpdateEnrollmentEstado: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../components/EnrollmentRowActions", () => ({ EnrollmentRowActions: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import { EnrolledPersonsTable } from "../components/EnrolledPersonsTable";

afterEach(() => cleanup());

describe("EnrolledPersonsTable — toolbar de contacto alcanzable", () => {
  it("admin ve los botones de copiar correos y teléfonos", () => {
    render(<EnrolledPersonsTable programId="prog-1" isAdmin estadosHabilitados={["activo"]} />);
    expect(
      screen.getByRole("button", { name: /copiar los correos/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /whatsapp/i })
    ).toBeInTheDocument();
  });

  it("sin isAdmin la toolbar no se monta", () => {
    render(<EnrolledPersonsTable programId="prog-1" estadosHabilitados={["activo"]} />);
    expect(screen.queryByRole("button", { name: /copiar los correos/i })).toBeNull();
  });
});
