/**
 * Contract-first tests for <SessionNotaEntregaButton />.
 *
 * Spec source: E1 plan Task 13
 *
 * Iron Law: these tests define the contract. Fix the component, never the test.
 *
 * NOTE: atob / URL.createObjectURL are not available in jsdom and are not
 * exercised here. The three assertions below cover render, disabled-state, and
 * mutate-call behaviour — the download side-effect is tested at integration level.
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── jsdom stubs ───────────────────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

// Guard: jsdom does not implement atob or URL.createObjectURL — stub them so
// GenerateDocumentButton's onSuccess path does not throw if ever invoked.
if (typeof global.atob === "undefined") {
  global.atob = () => "";
}
if (typeof URL.createObjectURL === "undefined") {
  URL.createObjectURL = () => "blob:mock";
}
if (typeof URL.revokeObjectURL === "undefined") {
  URL.revokeObjectURL = () => {};
}

// ── tRPC mock ─────────────────────────────────────────────────────────────────
// vi.hoisted ensures the factory runs before any import so that the mock is
// in place when GenerateDocumentButton is first imported via the component
// under test.
const { mockMutate, mockUseMutation } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockUseMutation: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    families: {
      generateDocument: {
        useMutation: mockUseMutation,
      },
    },
  },
}));

// ── sonner mock ───────────────────────────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ── DocumentPreviewDialog mock (avoid rendering Office iframe in tests) ───────
vi.mock(
  "@/features/families/components/DocumentPreviewDialog",
  () => ({
    DocumentPreviewDialog: () => null,
  }),
);

// Import AFTER mocks are registered.
import { SessionNotaEntregaButton } from "../SessionNotaEntregaButton";

// ── Helpers ───────────────────────────────────────────────────────────────────
function setupDefaultMocks({ isPending = false }: { isPending?: boolean } = {}) {
  mockUseMutation.mockImplementation(() => ({
    mutate: mockMutate,
    isPending,
  }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("SessionNotaEntregaButton", () => {
  // 1 ──────────────────────────────────────────────────────────────────────────
  it('renders enabled "Hoja de firmas" button when sessionId is provided', () => {
    setupDefaultMocks();
    render(
      <SessionNotaEntregaButton
        familyId="fam-1"
        sessionId="session-42"
      />,
    );

    const button = screen.getByRole("button", { name: /hoja de firmas/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  // 2 ──────────────────────────────────────────────────────────────────────────
  it("disables the button and shows blocking error alert when sessionId is undefined", () => {
    setupDefaultMocks();
    render(
      <SessionNotaEntregaButton
        familyId="fam-1"
      />,
    );

    // Button must be disabled
    const button = screen.getByRole("button", { name: /hoja de firmas/i });
    expect(button).toBeDisabled();

    // Blocking error must be visible with role=alert — no interaction required
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(
      "Selecciona una sesión cerrada para generar la hoja de firmas.",
    );
  });

  // 3 ──────────────────────────────────────────────────────────────────────────
  it("clicking the button calls mutate with slug=nota_entrega, session_id and family_id", async () => {
    setupDefaultMocks();
    render(
      <SessionNotaEntregaButton
        familyId="fam-99"
        sessionId="session-77"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /hoja de firmas/i }));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "nota_entrega",
        session_id: "session-77",
        family_id: "fam-99",
      }),
    );
  });
});
