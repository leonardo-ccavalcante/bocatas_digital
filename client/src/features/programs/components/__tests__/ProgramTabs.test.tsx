/**
 * Contract-first tests for <ProgramTabs />.
 *
 * Spec source: docs/superpowers/specs/2026-05-06-programa-familia-5-tab-surface.md
 * and CLAUDE.md Phase 1 Task 5.
 *
 * Iron Law: these tests define the contract. Fix the component, never the test.
 */

import React, { Suspense } from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// Radix UI Tooltip uses ResizeObserver for positioning; jsdom doesn't provide it.
// Stub it so Radix doesn't throw during tooltip mount.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

// ── Lazy-child mocks ──────────────────────────────────────────────────────────
// We mock the lazy-loaded feature modules BEFORE importing ProgramTabs so that
// React.lazy never attempts a real dynamic import in jsdom.

const FamiliasTabMock = vi.fn((_props: { programaId: string }) => (
  <div data-testid="familias-tab-mock" />
));

const UploadsTabMock = vi.fn((_props: { programaId: string }) => (
  <div data-testid="uploads-tab-mock" />
));

const MapaTabMock = vi.fn(() => <div data-testid="mapa-tab-mock" />);

const ReportsTabMock = vi.fn(
  (_props: { currentUserId: string; programaId?: string }) => (
    <div data-testid="reports-tab-mock" />
  ),
);

vi.mock("@/features/familias-tab", () => ({
  default: FamiliasTabMock,
}));

vi.mock("@/features/uploads-tab", () => ({
  default: UploadsTabMock,
}));

vi.mock("@/features/mapa-tab", () => ({
  default: MapaTabMock,
}));

vi.mock("@/features/reports-tab", () => ({
  default: ReportsTabMock,
}));

// ProgramTabs reads the current user (for ReportsTab's currentUserId).
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, role: "admin" } }),
}));

// Import AFTER mocks are registered.
import { ProgramTabs } from "../ProgramTabs";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal Program shape required by ProgramTabs */
function makeProgram(slug: string, id = "prog-1") {
  return { id, slug, nombre: slug };
}

/** Render with a fresh in-memory router (optional initial search string). */
function renderWithRouter(
  ui: React.ReactElement,
  { searchPath = "" }: { searchPath?: string } = {},
) {
  const loc = memoryLocation({ path: "/programas/prog-1", searchPath, record: true });
  const result = render(
    <Router hook={loc.hook} searchHook={loc.searchHook}>
      <Suspense fallback={<div>loading…</div>}>{ui}</Suspense>
    </Router>,
  );
  return { ...result, loc };
}

/**
 * vitest does NOT inject afterEach into global scope without `globals: true`
 * in vitest.config.ts. @testing-library/react's auto-cleanup checks
 * `typeof afterEach === 'function'` at import time and registers nothing when
 * globals are off. We must call cleanup() explicitly.
 */
afterEach(() => {
  cleanup();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ProgramTabs contract", () => {
  beforeEach(() => {
    FamiliasTabMock.mockClear();
    UploadsTabMock.mockClear();
  });

  // 1 ──────────────────────────────────────────────────────────────────────────
  it("returns null for non-programa_familias slugs", () => {
    const { container } = renderWithRouter(
      <ProgramTabs program={makeProgram("comedor")} />,
    );
    expect(container.firstChild).toBeNull();
  });

  // 2 ──────────────────────────────────────────────────────────────────────────
  it("renders 7 tab triggers in spec order for programa_familias", () => {
    renderWithRouter(<ProgramTabs program={makeProgram("programa_familias")} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(7);
    const labels = tabs.map((t) => t.textContent?.trim());
    expect(labels).toEqual([
      "Familias",
      "Informes",
      "Lista de distribución",
      "Mapa",
      "Reports",
      "Uploads",
      "Derivar",
    ]);
  });

  // 3 ──────────────────────────────────────────────────────────────────────────
  it("enables all seven tabs including Informes, Repartos and Derivar", () => {
    renderWithRouter(<ProgramTabs program={makeProgram("programa_familias")} />);

    const allTabs = screen.getAllByRole("tab");
    // Index order: Familias(0), Informes(1), Lista de distribución(2), Mapa(3), Reports(4), Uploads(5), Derivar(6)
    const [familias, informes, repartos, mapa, reports, uploads, derivar] = allTabs;

    function isDisabledTab(el: HTMLElement): boolean {
      return (
        el.hasAttribute("disabled") ||
        el.getAttribute("aria-disabled") === "true"
      );
    }
    // All tabs are live.
    expect(isDisabledTab(familias)).toBe(false);
    expect(isDisabledTab(informes)).toBe(false);
    expect(isDisabledTab(repartos)).toBe(false);
    expect(isDisabledTab(uploads)).toBe(false);
    expect(isDisabledTab(mapa)).toBe(false);
    expect(isDisabledTab(reports)).toBe(false);
    expect(isDisabledTab(derivar)).toBe(false);
  });

  // 4 ──────────────────────────────────────────────────────────────────────────
  it("mounts FamiliasTab pane when tab=familias (default, no ?tab= in URL)", async () => {
    renderWithRouter(<ProgramTabs program={makeProgram("programa_familias")} />);
    // Default tab is familias — content pane should be present
    expect(await screen.findByTestId("familias-tab-mock")).toBeInTheDocument();
  });

  // 6 ──────────────────────────────────────────────────────────────────────────
  it("mounts UploadsTab pane when tab=uploads", async () => {
    renderWithRouter(
      <ProgramTabs program={makeProgram("programa_familias")} />,
      { searchPath: "tab=uploads" },
    );
    expect(await screen.findByTestId("uploads-tab-mock")).toBeInTheDocument();
  });

  // 7 ──────────────────────────────────────────────────────────────────────────
  it("does NOT mount content panes for Mapa, Reports, Derivar (lazy chunks not requested)", async () => {
    renderWithRouter(<ProgramTabs program={makeProgram("programa_familias")} />);
    // Wait for the enabled tab to settle so we're not in a loading state
    await screen.findByTestId("familias-tab-mock");

    expect(screen.queryByTestId("mapa-tab-mock")).toBeNull();
    expect(screen.queryByTestId("reports-tab-mock")).toBeNull();
    expect(screen.queryByTestId("derivar-tab-mock")).toBeNull();
  });

  // 8 ──────────────────────────────────────────────────────────────────────────
  it("clicking an enabled tab updates ?tab= in the URL", async () => {
    const user = userEvent.setup();
    const { loc } = renderWithRouter(
      <ProgramTabs program={makeProgram("programa_familias")} />,
    );

    // Uploads is index 5 per spec order (Familias, Informes, Lista de distribución, Mapa, Reports, Uploads, Derivar)
    const allTabs = screen.getAllByRole("tab");
    const uploadsTab = allTabs[5];
    await user.click(uploadsTab);

    await waitFor(() => {
      const lastEntry = loc.history?.[loc.history.length - 1] ?? "";
      expect(lastEntry).toContain("tab=uploads");
    });
  });

  // 9 ──────────────────────────────────────────────────────────────────────────
  it("passes programaId={program.id} to FamiliasTab and UploadsTab content", async () => {
    const user = userEvent.setup();
    const { loc } = renderWithRouter(
      <ProgramTabs program={makeProgram("programa_familias", "prog-abc")} />,
    );

    // Familias is the default tab — its pane should already be rendered
    await screen.findByTestId("familias-tab-mock");
    // React 19 calls function components with (props) only; don't assert the
    // second arg (which would be undefined in React 19, not a ref object).
    expect(FamiliasTabMock).toHaveBeenCalledWith(
      expect.objectContaining({ programaId: "prog-abc" }),
      undefined,
    );

    // Navigate to uploads and verify UploadsTab also receives the id
    const allTabs = screen.getAllByRole("tab");
    const uploadsTab = allTabs[5];
    await user.click(uploadsTab);

    await waitFor(() => {
      const lastEntry = loc.history?.[loc.history.length - 1] ?? "";
      expect(lastEntry).toContain("tab=uploads");
    });

    await screen.findByTestId("uploads-tab-mock");
    expect(UploadsTabMock).toHaveBeenCalledWith(
      expect.objectContaining({ programaId: "prog-abc" }),
      undefined,
    );
  });
});
