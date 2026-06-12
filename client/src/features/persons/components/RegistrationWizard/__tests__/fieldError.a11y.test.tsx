/**
 * fieldError.a11y.test.tsx — IRI-04 (WCAG 3.3.1) regression lock-in.
 *
 * Asserts:
 *   (a) FieldError renders with the given id + role="alert".
 *   (b) At least one real wizard step input carries aria-describedby pointing
 *       to the rendered error id, and aria-invalid when an error is present.
 *
 * Mount pattern follows RegistrationWizard.gate.test.tsx (same vi.mock set).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FieldError } from "../_shared";
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

// ── mocks (mirrors gate test) ───────────────────────────────────────────────
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
vi.mock("../../../hooks/useDuplicateCheck", () => ({
  useDuplicateCheck: () => ({ data: [], isLoading: false, isError: false }),
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

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

// ── (a) FieldError standalone ───────────────────────────────────────────────
describe("FieldError — role + id", () => {
  it("renders role=\"alert\" and the given id when message is present", () => {
    render(<FieldError id="nombre-error" message="El nombre es obligatorio" />);
    const el = screen.getByRole("alert");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("id", "nombre-error");
    expect(el).toHaveTextContent("El nombre es obligatorio");
  });

  it("renders nothing when message is absent", () => {
    const { container } = render(<FieldError id="nombre-error" message={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

// ── (b) Wizard step input wiring ────────────────────────────────────────────
describe("RegistrationWizard — aria-describedby / aria-invalid wiring on nombre", () => {
  it("adds aria-invalid + aria-describedby pointing to the error element after failed submit", async () => {
    const user = userEvent.setup();
    render(<RegistrationWizard />);

    // Attempt to advance without filling required fields.
    await user.click(screen.getByRole("button", { name: /Continuar/i }));

    await waitFor(() => {
      expect(screen.getByText(/El nombre es obligatorio/i)).toBeInTheDocument();
    });

    const input = document.querySelector<HTMLInputElement>("#nombre");
    expect(input).not.toBeNull();
    expect(input!.getAttribute("aria-invalid")).toBe("true");

    const errorId = input!.getAttribute("aria-describedby");
    expect(errorId).toBeTruthy();
    // The error element with that id must exist in the DOM.
    expect(document.getElementById(errorId!)).toBeInTheDocument();
  });

  it("the SelectField forwarding path carries aria onto the rendered Radix combobox (canal_llegada)", async () => {
    // SelectField forwards aria-describedby/aria-invalid via triggerProps to
    // Radix SelectTrigger — assert on the RENDERED <button role="combobox">,
    // not just plain <Input>s, so the forwarding path has a regression guard.
    const user = userEvent.setup();
    render(<RegistrationWizard />);

    await user.click(screen.getByRole("button", { name: /Continuar/i }));
    await waitFor(() => {
      expect(screen.getByText(/El nombre es obligatorio/i)).toBeInTheDocument();
    });

    const combo = screen.getByRole("combobox", { name: /Canal de llegada/i });
    expect(combo.getAttribute("aria-invalid")).toBe("true");
    const comboErrorId = combo.getAttribute("aria-describedby");
    expect(comboErrorId).toBeTruthy();
    expect(document.getElementById(comboErrorId!)).toBeInTheDocument();
  });
});
