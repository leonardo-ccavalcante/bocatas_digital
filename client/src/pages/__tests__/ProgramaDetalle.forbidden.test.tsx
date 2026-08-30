/**
 * ProgramaDetalle.forbidden.test.tsx — RC-07 (F142).
 * Un error FORBIDDEN debe mostrarse como mensaje de permisos en español,
 * no como el estado engañoso "Programa no encontrado".
 * Mocking pattern: ProgramaDetalle.tabs.test.tsx.
 */
import React, { Suspense } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

vi.mock("@/features/programs/components/ProgramTabs", () => ({
  ProgramTabs: () => <div data-testid="program-tabs-mock" />,
}));
vi.mock("@/features/programs/components/EnrolledPersonsTable", () => ({
  EnrolledPersonsTable: () => null,
}));
vi.mock("@/features/programs/components/EnrollPersonModal", () => ({
  EnrollPersonModal: () => null,
}));
vi.mock("@/components/layout/AppShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { mockGetBySlugUseQuery } = vi.hoisted(() => ({
  mockGetBySlugUseQuery: vi.fn(),
}));

const noopMutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
const noopQuery = { data: [], isLoading: false, error: null };

vi.mock("@/lib/trpc", () => ({
  trpc: {
    programs: {
      getBySlug: { useQuery: mockGetBySlugUseQuery },
      getEnrollments: { useQuery: () => ({ data: undefined, isLoading: false, error: null }) },
      getAll: { useQuery: () => noopQuery },
      getAllWithCounts: { useQuery: () => noopQuery },
      update: { useMutation: () => noopMutation },
      deactivate: { useMutation: () => noopMutation },
      create: { useMutation: () => noopMutation },
    },
    useUtils: () => ({
      programs: {
        getBySlug: { invalidate: vi.fn() },
        getEnrollments: { invalidate: vi.fn() },
        getAllWithCounts: { invalidate: vi.fn() },
        getAll: { invalidate: vi.fn() },
      },
    }),
  },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u1", role: "voluntario", name: "Vol" },
    loading: false,
    isAuthenticated: true,
  }),
}));

import ProgramaDetalle from "../ProgramaDetalle";

afterEach(cleanup);

function renderPage(slug: string) {
  const loc = memoryLocation({ path: `/programas/${slug}`, record: true });
  return render(
    <Router hook={loc.hook} searchHook={loc.searchHook}>
      <Suspense fallback={<div>loading…</div>}>
        <ProgramaDetalle />
      </Suspense>
    </Router>,
  );
}

describe("ProgramaDetalle — errores con mensaje honesto", () => {
  it("FORBIDDEN muestra mensaje de permisos, no 'Programa no encontrado'", async () => {
    mockGetBySlugUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: "forbidden", data: { code: "FORBIDDEN" } },
    });

    renderPage("programa_familias");

    await waitFor(() => {
      expect(
        screen.getByText("No tienes permiso para ver este programa"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("Programa no encontrado")).toBeNull();
  });

  it("NOT_FOUND mantiene 'Programa no encontrado'", async () => {
    mockGetBySlugUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: "not found", data: { code: "NOT_FOUND" } },
    });

    renderPage("no-existe");

    await waitFor(() => {
      expect(screen.getByText("Programa no encontrado")).toBeInTheDocument();
    });
  });
});
