/**
 * Contract-first tests for <ProgramaDetalle /> conditional tab surface.
 *
 * Spec source: CLAUDE.md Phase 1 Task 6.
 * Branch: feat/programa-familia-5-tab-surface
 *
 * Iron Law: these tests define the contract. Fix the component, never the test.
 *
 * What is tested:
 *  1. When program.slug === "programa_familias" → <ProgramTabs /> is mounted.
 *  2. When program.slug !== "programa_familias" → <ProgramTabs /> is NOT mounted.
 *  3. For non-programa_familias slugs → <EnrolledPersonsTable /> IS rendered.
 *  4. For programa_familias → <EnrolledPersonsTable /> is NOT rendered.
 *  5. Header (program name) is always rendered regardless of slug.
 *  6. ProgramTabs receives program.nombre mapped from tRPC program.name.
 */

import React, { Suspense } from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ── jsdom stubs ───────────────────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

// ── Capture ProgramTabs props ─────────────────────────────────────────────────
// We need access to the props passed to ProgramTabs in test 6.
// Use a module-level variable that the mock writes to.
let lastProgramTabsProps: Record<string, unknown> | null = null;

// ── Mocks (must be registered before component imports) ───────────────────────

vi.mock("@/features/programs/components/ProgramTabs", () => ({
  ProgramTabs: (props: { program: { id: string; slug: string; nombre: string } }) => {
    lastProgramTabsProps = props as unknown as Record<string, unknown>;
    return <div data-testid="program-tabs-mock" />;
  },
}));

vi.mock("@/features/programs/components/EnrolledPersonsTable", () => ({
  EnrolledPersonsTable: () => <div data-testid="enrolled-persons-table-mock" />,
}));

// Mocked tRPC queries. We use vi.hoisted so the mock factory can reference
// the control variables before module evaluation.
const { mockGetBySlugUseQuery, mockGetEnrollmentsUseQuery } = vi.hoisted(() => ({
  mockGetBySlugUseQuery: vi.fn(),
  mockGetEnrollmentsUseQuery: vi.fn(),
}));

const noopMutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };

vi.mock("@/lib/trpc", () => ({
  trpc: {
    programs: {
      getBySlug: { useQuery: mockGetBySlugUseQuery },
      getEnrollments: { useQuery: mockGetEnrollmentsUseQuery },
      update: { useMutation: () => noopMutation },
      deactivate: { useMutation: () => noopMutation },
    },
    useUtils: () => ({
      programs: {
        getBySlug: { invalidate: vi.fn() },
        getEnrollments: { invalidate: vi.fn() },
      },
    }),
  },
}));

// Mock useAuth so ProtectedRoute / admin-conditional UI renders without real
// session infrastructure.
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u1", role: "admin", name: "Admin User" },
    loading: false,
    isAuthenticated: true,
  }),
}));

// Mock AppShell — ProtectedRoute wraps children in AppShell which pulls in
// navigation, sidebar, etc. Replace with a transparent pass-through.
vi.mock("@/components/layout/AppShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock EnrollPersonModal (opened by a button on the detail page)
vi.mock("@/features/programs/components/EnrollPersonModal", () => ({
  EnrollPersonModal: () => null,
}));

// Import the page AFTER all mocks are registered.
import ProgramaDetalle from "../ProgramaDetalle";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProgram(slug: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    slug,
    name: "Programa de Familia",
    description: "Desc",
    isActive: true,
    enrollmentCount: 3,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeEnrollments() {
  return [
    { id: "e1", personId: "per1", person: { id: "per1", name: "Ana García" } },
  ];
}

/**
 * Render ProgramaDetalle with a wouter in-memory router rooted at
 * /programas/<slug> so useParams resolves correctly.
 */
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

// ── Cleanup ───────────────────────────────────────────────────────────────────
// @testing-library auto-cleanup requires globals:true in vitest config.
// We call cleanup() manually to be safe.
afterEach(() => {
  cleanup();
  lastProgramTabsProps = null;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ProgramaDetalle conditional tab surface", () => {
  beforeEach(() => {
    // Default: enrollments always return an empty array so the table
    // renders without throwing.
    mockGetEnrollmentsUseQuery.mockReturnValue({
      data: makeEnrollments(),
      isLoading: false,
      error: null,
    });
  });

  // 1 ──────────────────────────────────────────────────────────────────────────
  it("mounts ProgramTabs when program.slug = 'programa_familias'", async () => {
    mockGetBySlugUseQuery.mockReturnValue({
      data: makeProgram("programa_familias"),
      isLoading: false,
      error: null,
    });

    renderPage("programa_familias");

    await waitFor(() => {
      expect(screen.getByTestId("program-tabs-mock")).toBeInTheDocument();
    });
  });

  // 2 ──────────────────────────────────────────────────────────────────────────
  it("does NOT mount ProgramTabs when program.slug = 'comedor'", async () => {
    mockGetBySlugUseQuery.mockReturnValue({
      data: makeProgram("comedor", { name: "Comedor" }),
      isLoading: false,
      error: null,
    });

    renderPage("comedor");

    await waitFor(() => {
      // Ensure non-loading state has settled
      expect(screen.queryByTestId("program-tabs-mock")).toBeNull();
    });
  });

  // 3 ──────────────────────────────────────────────────────────────────────────
  it("renders EnrolledPersonsTable for non-programa_familias slugs", async () => {
    mockGetBySlugUseQuery.mockReturnValue({
      data: makeProgram("comedor", { name: "Comedor" }),
      isLoading: false,
      error: null,
    });

    renderPage("comedor");

    await waitFor(() => {
      expect(screen.getByTestId("enrolled-persons-table-mock")).toBeInTheDocument();
    });
  });

  // 4 ──────────────────────────────────────────────────────────────────────────
  it("does NOT render EnrolledPersonsTable for programa_familias", async () => {
    mockGetBySlugUseQuery.mockReturnValue({
      data: makeProgram("programa_familias"),
      isLoading: false,
      error: null,
    });

    renderPage("programa_familias");

    await waitFor(() => {
      expect(screen.getByTestId("program-tabs-mock")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("enrolled-persons-table-mock")).toBeNull();
  });

  // 5 ──────────────────────────────────────────────────────────────────────────
  it.each([
    ["programa_familias", "Programa de Familia"],
    ["comedor", "Comedor"],
  ])(
    "always renders the header (program name) for slug=%s",
    async (slug, programName) => {
      mockGetBySlugUseQuery.mockReturnValue({
        data: makeProgram(slug, { name: programName }),
        isLoading: false,
        error: null,
      });

      renderPage(slug);

      await waitFor(() => {
        expect(screen.getByText(programName)).toBeInTheDocument();
      });
    },
  );

  // 6 ──────────────────────────────────────────────────────────────────────────
  it("maps program.name to ProgramTabs's program.nombre prop", async () => {
    mockGetBySlugUseQuery.mockReturnValue({
      data: makeProgram("programa_familias", { id: "p1", name: "Programa de Familia" }),
      isLoading: false,
      error: null,
    });

    renderPage("programa_familias");

    await waitFor(() => {
      expect(screen.getByTestId("program-tabs-mock")).toBeInTheDocument();
    });

    expect(lastProgramTabsProps).not.toBeNull();
    const receivedProgram = (lastProgramTabsProps as { program: { id: string; slug: string; nombre: string } }).program;
    expect(receivedProgram).toMatchObject({
      id: "p1",
      slug: "programa_familias",
      nombre: "Programa de Familia",
    });
  });
});
