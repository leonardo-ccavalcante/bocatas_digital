/**
 * Contract-first tests for App.tsx legacy /familias redirect routes.
 *
 * Spec source: CLAUDE.md Phase 1 Task 10.
 * Branch: feat/programa-familia-5-tab-surface
 *
 * Iron Law: these tests define the contract. Fix the component, never the test.
 *
 * Scope note: We render only the wouter <Router> subtree extracted from App
 * rather than the full <App /> wrapper (which pulls in ThemeProvider,
 * TooltipProvider, ErrorBoundary, etc.) to keep the mocking surface minimal.
 * The routes under test are unchanged by this scope-down.
 *
 * What is tested:
 *  1. /familias → Redirect to /programas/programa_familias?tab=familias
 *  2. /familias/cumplimiento → Redirect to /programas/programa_familias?tab=familias
 *  3. /familias/informes-sociales → Redirect to /programas/programa_familias?tab=reports
 *  4. /familias/:id → renders FamiliaDetalle (no redirect)
 *  5. /familias/nueva → renders FamiliaRegistro (no redirect)
 *  6. /familias/entregas → renders FamiliasEntregas (no redirect)
 *  7. /familias/verificar → renders FamiliasVerificar (no redirect)
 *  8. Redirects are role-protected: a voluntario cannot see the redirect.
 */

import React, { Suspense } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

// ── jsdom stubs ───────────────────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

// ── wouter Redirect mock ──────────────────────────────────────────────────────
// Replace Redirect with a div that surfaces its `to` attribute so assertions
// can check the target URL without triggering real navigation.
vi.mock("wouter", async () => {
  const real = await vi.importActual<typeof import("wouter")>("wouter"); // eslint-disable-line @typescript-eslint/consistent-type-imports
  return {
    ...real,
    Redirect: ({ to }: { to: string }) => (
      <div data-testid="redirect-mock" data-to={to} />
    ),
  };
});

// ── Auth mock ─────────────────────────────────────────────────────────────────
// Controlled via a module-level variable so individual tests can override role.
const authState = {
  user: { id: "u1", role: "admin", name: "Admin" } as { id: string; role: string; name: string } | null,
  loading: false,
  isAuthenticated: true,
};

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    ...authState,
    refresh: vi.fn(),
    logout: vi.fn(),
  }),
}));

// ── AppShell mock ─────────────────────────────────────────────────────────────
// ProtectedRoute wraps children in AppShell; replace with a transparent shell.
vi.mock("@/components/layout/AppShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Page component mocks ──────────────────────────────────────────────────────
// Prevent lazy imports from pulling in tRPC / Supabase dependencies in jsdom.
vi.mock("@/pages/Home", () => ({
  default: () => <div data-testid="home-page" />,
}));
vi.mock("./pages/Home", () => ({
  default: () => <div data-testid="home-page" />,
}));
vi.mock("@/pages/Personas", () => ({
  default: () => <div data-testid="personas-page" />,
}));
vi.mock("@/pages/PersonasNueva", () => ({
  default: () => <div data-testid="personas-nueva-page" />,
}));
vi.mock("@/pages/PersonaDetalle", () => ({
  default: () => <div data-testid="persona-detalle-page" />,
}));
vi.mock("@/pages/PersonaQR", () => ({
  default: () => <div data-testid="persona-qr-page" />,
}));
vi.mock("@/pages/CheckIn", () => ({
  default: () => <div data-testid="checkin-page" />,
}));
vi.mock("@/pages/Dashboard", () => ({
  default: () => <div data-testid="dashboard-page" />,
}));
vi.mock("@/pages/Programas", () => ({
  default: () => <div data-testid="programas-page" />,
}));
vi.mock("@/pages/ProgramaDetalle", () => ({
  default: () => <div data-testid="programa-detalle-page" />,
}));
vi.mock("@/pages/AdminConsentimientos", () => ({
  default: () => <div data-testid="admin-consentimientos-page" />,
}));
vi.mock("@/pages/AdminProgramas", () => ({
  default: () => <div data-testid="admin-programas-page" />,
}));
vi.mock("@/pages/AdminUsuarios", () => ({
  default: () => <div data-testid="admin-usuarios-page" />,
}));
vi.mock("@/pages/AdminNovedades", () => ({
  default: () => <div data-testid="admin-novedades-page" />,
}));
vi.mock("@/pages/AdminSoftDeleteRecovery", () => ({
  AdminSoftDeleteRecovery: () => <div data-testid="admin-soft-delete-page" />,
}));
vi.mock("@/pages/admin/LogsPage", () => ({
  LogsPage: () => <div data-testid="admin-logs-page" />,
}));
vi.mock("@/pages/FamiliaRegistro", () => ({
  default: () => <div data-testid="familia-registro-page" />,
}));
vi.mock("@/pages/FamiliaDetalle", () => ({
  default: () => <div data-testid="familia-detalle-page" />,
}));
vi.mock("@/pages/FamiliasVerificar", () => ({
  default: () => <div data-testid="familias-verificar-page" />,
}));
vi.mock("@/pages/FamiliasEntregas", () => ({
  default: () => <div data-testid="familias-entregas-page" />,
}));
vi.mock("@/pages/Perfil", () => ({
  default: () => <div data-testid="perfil-page" />,
}));
vi.mock("@/pages/MiQR", () => ({
  default: () => <div data-testid="mi-qr-page" />,
}));
vi.mock("@/pages/Novedades", () => ({
  default: () => <div data-testid="novedades-page" />,
}));
vi.mock("@/pages/NovedadDetalle", () => ({
  default: () => <div data-testid="novedad-detalle-page" />,
}));
vi.mock("@/pages/NotFound", () => ({
  default: () => <div data-testid="not-found-page" />,
}));
vi.mock("@/pages/Login", () => ({
  default: () => <div data-testid="login-page" />,
}));

// Stub non-critical UI providers used by App wrapper
vi.mock("@/components/ui/sonner", () => ({
  Toaster: () => null,
}));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("./contexts/ThemeContext", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/contexts/ThemeContext", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("./components/ErrorBoundary", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Import App AFTER all mocks are registered.
import App from "../App";

// ── Cleanup ───────────────────────────────────────────────────────────────────
afterEach(() => {
  cleanup();
  // Reset auth to admin default
  authState.user = { id: "u1", role: "admin", name: "Admin" };
  authState.loading = false;
  authState.isAuthenticated = true;
});

// ── Helper ────────────────────────────────────────────────────────────────────

function renderAtPath(path: string) {
  window.history.replaceState({}, "", path);
  return render(
    <Suspense fallback={<div>loading…</div>}>
      <App />
    </Suspense>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("App.tsx legacy /familias redirects", () => {
  // 1 ──────────────────────────────────────────────────────────────────────────
  it("/familias redirects to /programas/programa_familias?tab=familias", () => {
    renderAtPath("/familias");

    const redirect = screen.getByTestId("redirect-mock");
    expect(redirect).toHaveAttribute(
      "data-to",
      "/programas/programa_familias?tab=familias",
    );
  });

  // 2 ──────────────────────────────────────────────────────────────────────────
  it("/familias/cumplimiento redirects to /programas/programa_familias?tab=familias", () => {
    renderAtPath("/familias/cumplimiento");

    const redirect = screen.getByTestId("redirect-mock");
    expect(redirect).toHaveAttribute(
      "data-to",
      "/programas/programa_familias?tab=familias",
    );
  });

  // 3 ──────────────────────────────────────────────────────────────────────────
  it("/familias/informes-sociales redirects to /programas/programa_familias?tab=reports", () => {
    renderAtPath("/familias/informes-sociales");

    const redirect = screen.getByTestId("redirect-mock");
    expect(redirect).toHaveAttribute(
      "data-to",
      "/programas/programa_familias?tab=reports",
    );
  });

  // 4 ──────────────────────────────────────────────────────────────────────────
  it("/familias/:id does NOT redirect — renders FamiliaDetalle", async () => {
    renderAtPath("/familias/abc123");

    await waitFor(() => {
      expect(screen.getByTestId("familia-detalle-page")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("redirect-mock")).toBeNull();
  });

  // 5 ──────────────────────────────────────────────────────────────────────────
  it("/familias/nueva does NOT redirect — renders FamiliaRegistro", async () => {
    renderAtPath("/familias/nueva");

    await waitFor(() => {
      expect(screen.getByTestId("familia-registro-page")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("redirect-mock")).toBeNull();
  });

  // 6 ──────────────────────────────────────────────────────────────────────────
  it("/familias/entregas does NOT redirect — renders FamiliasEntregas", async () => {
    renderAtPath("/familias/entregas");

    await waitFor(() => {
      expect(screen.getByTestId("familias-entregas-page")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("redirect-mock")).toBeNull();
  });

  // 7 ──────────────────────────────────────────────────────────────────────────
  it("/familias/verificar does NOT redirect — renders FamiliasVerificar", async () => {
    renderAtPath("/familias/verificar");

    await waitFor(() => {
      expect(screen.getByTestId("familias-verificar-page")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("redirect-mock")).toBeNull();
  });

  // 8 ──────────────────────────────────────────────────────────────────────────
  it("redirects are role-protected: voluntario does NOT see the redirect", () => {
    // ProtectedRoute checks requiredRoles. When role doesn't match it returns null
    // (no children rendered, no redirect-mock) and navigates to /.
    authState.user = { id: "u2", role: "voluntario", name: "Voluntario" };

    renderAtPath("/familias");

    expect(
      screen.queryByTestId("redirect-mock"),
    ).toBeNull();
  });
});
