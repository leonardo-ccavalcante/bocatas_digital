/**
 * Home page — quick-action tile render + route contract tests.
 *
 * Verifies:
 *  1. Eyebrow / heading render when the user is an admin.
 *  2. Primary CTA (Check-in) renders and links to /checkin.
 *  3. Five secondary tiles render for admin role and link to real routes.
 *  4. Familias tile links to the redirect-aware target route.
 *  5. Beneficiario role sees a different primary tile (Mi perfil) and no
 *     admin-only tiles (Dashboard, Familias).
 *
 * Iron Law: these tests define the contract. Fix the component, never the test.
 */

import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// ── jsdom stubs ───────────────────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

// ── Auth mock ─────────────────────────────────────────────────────────────────
const authState = {
  user: { id: "u1", role: "admin", name: "Ana García" } as {
    id: string;
    role: string;
    name: string;
  } | null,
  loading: false,
  isAuthenticated: true,
};

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ ...authState, refresh: vi.fn(), logout: vi.fn() }),
}));

// ── Store mock ────────────────────────────────────────────────────────────────
vi.mock("@/store/useAppStore", () => ({
  useAppStore: () => ({
    selectedLocation: { id: "loc1", nombre: "Tetuán", tipo: "comedor" },
  }),
}));

// ── UrgentAnnouncementBanner mock ─────────────────────────────────────────────
vi.mock("@/components/UrgentAnnouncementBanner", () => ({
  default: () => null,
}));

// Import the component AFTER all mocks are registered.
import Home from "../Home";

// ── Cleanup ───────────────────────────────────────────────────────────────────
afterEach(() => {
  cleanup();
  authState.user = { id: "u1", role: "admin", name: "Ana García" };
  authState.loading = false;
  authState.isAuthenticated = true;
});

// ── Helper ────────────────────────────────────────────────────────────────────
function renderHome() {
  return render(<Home />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Home page — editorial header", () => {
  it("renders the first name from the user's full name", () => {
    renderHome();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hola, Ana");
  });

  it("renders the location badge when selectedLocation is set", () => {
    renderHome();
    expect(screen.getByText("Tetuán")).toBeInTheDocument();
  });
});

describe("Home page — primary CTA (admin role)", () => {
  it("renders the Check-in primary tile", () => {
    renderHome();
    const link = screen.getByRole("link", { name: /check-in/i });
    expect(link).toBeInTheDocument();
  });

  it("Check-in tile links to /checkin", () => {
    renderHome();
    const link = screen.getByRole("link", { name: /check-in/i });
    expect(link).toHaveAttribute("href", "/checkin");
  });
});

describe("Home page — secondary tiles (admin role)", () => {
  const EXPECTED_TILES: { label: RegExp; href: string }[] = [
    { label: /nueva persona/i, href: "/personas/nueva" },
    { label: /consultar ficha/i, href: "/personas" },
    { label: /programas/i, href: "/programas" },
    { label: /dashboard/i, href: "/dashboard" },
    { label: /familias/i, href: "/programas/programa_familias?tab=familias" },
  ];

  it("renders all expected secondary tiles with correct hrefs", () => {
    renderHome();
    for (const { label, href } of EXPECTED_TILES) {
      // Each tile is a <Link> with aria-label matching the tile label
      const links = screen.getAllByRole("link").filter((el) =>
        label.test(el.getAttribute("aria-label") ?? "")
      );
      expect(links.length, `Expected tile "${label}" to be rendered`).toBeGreaterThan(0);
      expect(links[0]).toHaveAttribute("href", href);
    }
  });

  it("renders the 'Acciones rápidas' section heading text", () => {
    renderHome();
    // The section rule contains this text
    expect(screen.getByText(/acciones rápidas/i)).toBeInTheDocument();
  });

  it("renders numbered markers starting at N° 01", () => {
    renderHome();
    expect(screen.getByText(/N°\s*01/)).toBeInTheDocument();
  });
});

describe("Home page — beneficiario role", () => {
  beforeEach(() => {
    authState.user = { id: "u2", role: "beneficiario", name: "Carlos López" };
  });

  it("renders Mi perfil as the primary tile", () => {
    renderHome();
    const link = screen.getByRole("link", { name: /mi perfil/i });
    expect(link).toHaveAttribute("href", "/perfil");
  });

  it("does NOT render Dashboard tile for beneficiario", () => {
    renderHome();
    const dashboardLinks = screen.queryAllByRole("link", { name: /dashboard/i });
    expect(dashboardLinks.length).toBe(0);
  });

  it("does NOT render Familias tile for beneficiario", () => {
    renderHome();
    const familiasLinks = screen.queryAllByRole("link", { name: /familias/i });
    expect(familiasLinks.length).toBe(0);
  });
});
