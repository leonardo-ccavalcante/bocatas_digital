/**
 * ManualSearchModal.a11y.test.tsx — IRI-05 (WCAG 4.1.3) regression lock-in.
 *
 * Asserts:
 *   (a) The results region has an aria-live="polite" sr-only count element.
 *   (b) The person-select button inside each result has type="button".
 *   (c) The loading div has role="status".
 *   (d) The empty-state div has role="status".
 *
 * tRPC is mocked at @/lib/trpc via vi.hoisted pattern (mirrors FamiliasList
 * tests). useDebounce is bypassed by controlling the mock return value directly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// ── hoisted mock factory ──────────────────────────────────────────────────────
const { mockUseQuery } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    checkin: {
      searchPersons: {
        useQuery: mockUseQuery,
      },
    },
  },
}));

// Bypass debounce so results are tied to the query state we control.
vi.mock("@/hooks/useDebounce", () => ({
  useDebounce: (v: string) => v,
}));

import { ManualSearchModal } from "../components/ManualSearchModal";

const PERSON = {
  id: "aaa",
  nombre: "Ana",
  apellidos: "García",
  fecha_nacimiento: "1990-01-01",
  foto_perfil_url: null,
  restricciones_alimentarias: null,
};

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe("ManualSearchModal — aria-live results announcement (IRI-05)", () => {
  it("the live region PRE-EXISTS in the DOM while results are empty", () => {
    // WCAG 4.1.3: a live region mounted at the same time as its first content
    // is never announced — only text CHANGES inside a pre-existing region are.
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });
    render(<ManualSearchModal open onClose={vi.fn()} onSelect={vi.fn()} />);

    const liveEl = document.querySelector('[aria-live="polite"][aria-atomic="true"]');
    expect(liveEl).not.toBeNull();
    expect(liveEl!.textContent).toBe("");
  });

  it("renders an aria-live polite sr-only count span when results are present", () => {
    mockUseQuery.mockReturnValue({ data: [PERSON], isLoading: false });
    render(<ManualSearchModal open onClose={vi.fn()} onSelect={vi.fn()} />);

    const liveEl = document.querySelector('[aria-live="polite"][aria-atomic="true"]');
    expect(liveEl).not.toBeNull();
    expect(liveEl!.classList.contains("sr-only")).toBe(true);
    expect(liveEl!.textContent).toMatch(/1 resultado/);
  });

  it("selects button has type=\"button\"", () => {
    mockUseQuery.mockReturnValue({ data: [PERSON], isLoading: false });
    render(<ManualSearchModal open onClose={vi.fn()} onSelect={vi.fn()} />);

    const buttons = screen.getAllByRole("button");
    // Find a result button (distinct from Cancel button which is variant="outline")
    const resultButton = buttons.find(
      (b) => b.textContent?.includes("Ana") && b.getAttribute("type") === "button"
    );
    expect(resultButton).toBeDefined();
    expect(resultButton!.getAttribute("type")).toBe("button");
  });
});

describe("ManualSearchModal — role=\"status\" on loading + empty state (IRI-05)", () => {
  it("loading div has role=\"status\"", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(<ManualSearchModal open onClose={vi.fn()} onSelect={vi.fn()} />);

    const statusEl = document.querySelector('[role="status"]');
    expect(statusEl).not.toBeNull();
  });

  it("empty-state div has role=\"status\" when query returns no results", () => {
    // Simulate: query resolved, 0 results.
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });

    render(<ManualSearchModal open onClose={vi.fn()} onSelect={vi.fn()} />);

    // DialogContent renders into a portal on document.body — use document.body.
    // useDebounce is identity-mocked so typing 3 chars immediately sets
    // debouncedQuery = "Ana", enabling the empty-state branch.
    const input = document.body.querySelector<HTMLInputElement>("input");
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { value: "Ana" } });

    const statusEl = document.body.querySelector('[role="status"]');
    expect(statusEl).not.toBeNull();
  });
});
