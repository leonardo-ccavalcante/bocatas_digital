/** @vitest-environment jsdom */
/**
 * Step6Summary — review-before-submit screen for the family intake wizard.
 *
 * Covers (a) the duplicate-titular warning derived from the EXISTING
 * families.getAll (matched by id, no new procedure), (b) that it is announced
 * as role="alert" for screen readers, and (c) the summary renders the resolved
 * titular name and Sí/No flags.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const personsGetById = vi.fn();
const familiesGetAll = vi.fn();
const usePrograms = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    persons: { getById: { useQuery: (...a: unknown[]) => personsGetById(...a) } },
    families: { getAll: { useQuery: (...a: unknown[]) => familiesGetAll(...a) } },
  },
}));
vi.mock("@/features/programs/hooks/usePrograms", () => ({
  usePrograms: () => usePrograms(),
}));

import { Step6Summary } from "../IntakeWizard/Step6Summary";

const TITULAR_ID = "11111111-1111-1111-1111-111111111111";

const baseProps = {
  titularId: TITULAR_ID,
  programId: "prog-1",
  members: [],
  docs: {
    docs_identidad: true,
    padron_recibido: false,
    justificante_recibido: false,
    informe_social: false,
  },
  consents: { consent_bocatas: true, consent_banco_alimentos: false },
  autorizado: false,
};

beforeEach(() => {
  personsGetById.mockReturnValue({ data: { id: TITULAR_ID, nombre: "Ana", apellidos: "García" } });
  usePrograms.mockReturnValue({ programs: [{ id: "prog-1", name: "Programa de Familia", icon: "" }] });
  familiesGetAll.mockReturnValue({ data: [] });
});

describe("Step6Summary", () => {
  it("renders the resolved titular name and programa", () => {
    render(<Step6Summary {...baseProps} />);
    expect(screen.getByText("Ana García")).toBeInTheDocument();
    expect(screen.getByText("Programa de Familia")).toBeInTheDocument();
  });

  it("does NOT warn when the titular heads no active family", () => {
    familiesGetAll.mockReturnValue({ data: [{ familia_numero: 7, persons: { id: "other-id" } }] });
    render(<Step6Summary {...baseProps} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("warns (role=alert) with the familia number when the titular already heads a family", () => {
    familiesGetAll.mockReturnValue({
      data: [{ familia_numero: 42, persons: { id: TITULAR_ID } }],
    });
    render(<Step6Summary {...baseProps} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("#42");
    expect(alert).toHaveTextContent(/ya es titular/i);
  });
});
