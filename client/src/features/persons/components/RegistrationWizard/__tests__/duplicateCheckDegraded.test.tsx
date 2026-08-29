/**
 * duplicateCheckDegraded.test.tsx — RC-02 / F048 lock-in.
 *
 * When persons.findDuplicates fails, the wizard used to swallow the error
 * (useDuplicateCheck coerced it to []) and silently proceed with no duplicate
 * warning at all. The hook now exposes `isDegraded`; phase 1 must show a
 * NON-BLOCKING Spanish notice so the volunteer knows the check did not run.
 *
 * Mount pattern follows fieldError.a11y.test.tsx (same vi.mock set).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ConsentTemplate, Program } from "../../../schemas";

// ── jsdom polyfills ─────────────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}

// ── mocks (mirrors fieldError.a11y.test.tsx) ────────────────────────────────
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn() }) },
    from: () => ({ select: vi.fn(), upsert: vi.fn() }),
    rpc: vi.fn(),
  }),
}));

const PROGRAMS: Program[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    slug: "comedor-social",
    name: "Comedor Social",
    icon: "🍽️",
    is_default: true,
    is_active: true,
    display_order: 1,
  },
];
vi.mock("../../../hooks/usePrograms", () => ({
  usePrograms: () => ({ data: PROGRAMS, isLoading: false, isError: false }),
}));

const ES_TEMPLATES: ConsentTemplate[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    purpose: "tratamiento_datos_bocatas",
    idioma: "es",
    version: "1.0",
    text_content: "Acepto el tratamiento.",
    is_active: true,
    updated_at: null,
  },
];
vi.mock("../../../hooks/useConsentTemplates", () => ({
  useConsentTemplates: () => ({ data: ES_TEMPLATES, isLoading: false, isError: false }),
}));

let duplicateCheckResult = {
  data: [] as unknown[],
  isLoading: false,
  isError: false,
  isDegraded: false,
};
vi.mock("../../../hooks/useDuplicateCheck", () => ({
  useDuplicateCheck: () => duplicateCheckResult,
}));

vi.mock("../../../hooks/useOCRDocument", () => ({
  useOCRDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../_useSubmit", () => ({
  useRegistrationSubmit: () => ({ isSubmitting: false, handleFinalSubmit: vi.fn() }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { RegistrationWizard } from "../../RegistrationWizard";

beforeEach(() => {
  vi.clearAllMocks();
  duplicateCheckResult = { data: [], isLoading: false, isError: false, isDegraded: false };
});
afterEach(() => {
  cleanup();
});

describe("RegistrationWizard — degraded duplicate check (RC-02 / F048)", () => {
  it("shows a non-blocking role=status notice when the check fails, and Continuar stays enabled", () => {
    duplicateCheckResult = { data: [], isLoading: false, isError: true, isDegraded: true };
    render(<RegistrationWizard />);

    const notice = screen.getByText(/No se pudo comprobar si la persona ya existe/i);
    expect(notice).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: /Continuar/i })).toBeEnabled();
  });

  it("shows no degraded notice when the check succeeds", () => {
    render(<RegistrationWizard />);
    expect(
      screen.queryByText(/No se pudo comprobar si la persona ya existe/i),
    ).not.toBeInTheDocument();
  });
});
