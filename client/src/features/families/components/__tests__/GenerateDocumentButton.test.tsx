/**
 * Contract-first tests for <GenerateDocumentButton />.
 *
 * Spec source: E1 plan Task 9
 *
 * Iron Law: these tests define the contract. Fix the component, never the test.
 *
 * NOTE: atob / URL.createObjectURL are not available in jsdom and are not
 * exercised here. The three assertions below cover render, disabled, and
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
// the component does not throw during onSuccess (which is not triggered in
// these render/disabled/click tests anyway).
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
vi.mock("../DocumentPreviewDialog", () => ({
  DocumentPreviewDialog: () => null,
}));

// Import AFTER mocks are registered.
import { GenerateDocumentButton } from "../GenerateDocumentButton";

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
describe("GenerateDocumentButton", () => {
  // 1 ──────────────────────────────────────────────────────────────────────────
  it("renders enabled button when no blockingError", () => {
    setupDefaultMocks();
    render(
      <GenerateDocumentButton
        familyId="fam-1"
        slug="derivacion"
        label="Generar derivación"
      />
    );

    const button = screen.getByRole("button", { name: /generar derivación/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  // 2 ──────────────────────────────────────────────────────────────────────────
  it("disables button and renders error text with role=alert when blockingError is set", () => {
    setupDefaultMocks();
    render(
      <GenerateDocumentButton
        familyId="fam-1"
        slug="nota_entrega"
        label="Generar nota de entrega"
        blockingError="Debe seleccionar una sesión antes de generar el documento"
      />
    );

    // Button must be disabled
    const button = screen.getByRole("button", { name: /generar nota de entrega/i });
    expect(button).toBeDisabled();

    // Error text must be visible with role=alert (not behind any interaction)
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(
      "Debe seleccionar una sesión antes de generar el documento"
    );
  });

  // 3 ──────────────────────────────────────────────────────────────────────────
  it("clicking the button calls mutate with { family_id, slug }", async () => {
    setupDefaultMocks();
    render(
      <GenerateDocumentButton
        familyId="fam-42"
        slug="derivacion"
        label="Generar derivación"
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /generar derivación/i }));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ family_id: "fam-42", slug: "derivacion" })
    );
  });
});
