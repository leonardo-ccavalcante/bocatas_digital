/**
 * FamiliasVerificar.test.tsx — RC-08 client contract (F165/F186).
 *
 * families.verifyIdentity returns { titular_nombre, estado, ... } — the page
 * used to render family.persons?.nombre and family.estado from a payload that
 * had neither (blank name lines + blank badge at the counter), and its
 * `enabled: query.trim().length >= 2` gate made families #1-#9 unreachable by
 * number. Mock/render idiom: FamiliasList.test.tsx + PersonaDetalle.test.tsx.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

const { mockUseQuery } = vi.hoisted(() => ({ mockUseQuery: vi.fn() }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    families: {
      verifyIdentity: { useQuery: mockUseQuery },
    },
  },
}));

// IdentityVerifier pulls its own trpc hooks — out of scope for this page contract.
vi.mock("@/features/families/components/IdentityVerifier", () => ({
  IdentityVerifier: () => <div data-testid="identity-verifier" />,
}));

// Import AFTER mocks are registered.
import FamiliasVerificar from "../FamiliasVerificar";

// Shape of one row as the SERVER actually returns it (compliance.ts verifyIdentity).
const RESULT_ROW = {
  id: "fam-1",
  familia_numero: 3,
  estado: "activa",
  titular_nombre: "Maria Garcia Lopez",
  num_miembros: 4,
  persona_recoge: "Maria",
  autorizado: false,
  autorizado_documento_url: null,
};

function renderPage() {
  const loc = memoryLocation({ path: "/familias/verificar", record: true });
  return render(
    <Router hook={loc.hook} searchHook={loc.searchHook}>
      <FamiliasVerificar />
    </Router>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FamiliasVerificar search results (RC-08)", () => {
  it("renders titular_nombre and the estado badge from the verifyIdentity payload", async () => {
    mockUseQuery.mockReturnValue({ data: [RESULT_ROW], isLoading: false });

    renderPage();
    await userEvent.type(
      screen.getByPlaceholderText(/nombre o apellidos/i),
      "Maria",
    );

    expect(screen.getByText("Maria Garcia Lopez")).toBeInTheDocument();
    expect(screen.getByText("activa")).toBeInTheDocument();
  });

  it("enables and renders results for a single-digit family-number query", async () => {
    mockUseQuery.mockReturnValue({ data: [RESULT_ROW], isLoading: false });

    renderPage();
    await userEvent.type(
      screen.getByPlaceholderText(/nombre o apellidos/i),
      "3",
    );

    expect(screen.getByText("Maria Garcia Lopez")).toBeInTheDocument();
    const lastCall = mockUseQuery.mock.calls.at(-1)!;
    expect(lastCall[1]).toMatchObject({ enabled: true });
  });
});
