/**
 * RegistrationWizard — per-phase Zod gating + consent-language fallback.
 *
 * Mounts the real 4-phase wizard (jsdom env via the .test.tsx glob in
 * vitest.config). The tRPC-backed feature hooks and the submit hook are
 * mocked so the mount is self-contained — we exercise the wizard's own
 * navigation/gating + fallback logic, not the network layer.
 *
 *   (a) GATE: cannot advance past Phase 1 (Identidad) with empty required
 *       fields — validation comes from the existing PersonCreateSchema via
 *       react-hook-form trigger(). After filling them, advance succeeds.
 *   (b) FALLBACK: when idioma_principal has no active consent template
 *       (e.g. "wo"/"en"), the verbal-translation banner is rendered.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ConsentTemplate, Program } from "../schemas";

// ── jsdom polyfills used by Radix primitives ─────────────────────────────────
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

// The browser supabase client throws at module-load without VITE env vars.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn() }) },
    from: () => ({ select: vi.fn(), upsert: vi.fn() }),
    rpc: vi.fn(),
  }),
}));

// Programs come from a tRPC query — return a deterministic, non-familia set.
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
vi.mock("../hooks/usePrograms", () => ({
  usePrograms: () => ({ data: PROGRAMS, isLoading: false, isError: false }),
}));

// Spanish-only template set (the realistic case: long-tail languages have none).
const ES_TEMPLATES: ConsentTemplate[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    purpose: "tratamiento_datos_bocatas",
    idioma: "es",
    version: "1.0",
    text_content: "Acepto el tratamiento de mis datos.",
    is_active: true,
    updated_at: null,
  },
];
vi.mock("../hooks/useConsentTemplates", () => ({
  useConsentTemplates: (idioma: string) => ({
    // Only Spanish templates exist; any other language resolves to the
    // Spanish set (the wizard never silently swaps language — it shows the
    // fallback banner instead).
    data: idioma === "es" ? ES_TEMPLATES : ES_TEMPLATES,
    isLoading: false,
    isError: false,
  }),
}));

// No duplicates — keep the warning out of the way of the gate test.
vi.mock("../hooks/useDuplicateCheck", () => ({
  useDuplicateCheck: () => ({ data: [], isLoading: false, isError: false }),
}));

// OCR mutation hook (pulled in by DocumentCaptureInline).
vi.mock("../hooks/useOCRDocument", () => ({
  useOCRDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// Submit hook — we never reach submit in these tests, but the wizard calls it.
vi.mock("../components/RegistrationWizard/_useSubmit", () => ({
  useRegistrationSubmit: () => ({ isSubmitting: false, handleFinalSubmit: vi.fn() }),
}));

// Toast — assert the Phase-3 program gate fires toast.error.
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
import { toast } from "sonner";

import { RegistrationWizard } from "../components/RegistrationWizard";

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
});

describe("RegistrationWizard — Phase 1 gate (Zod-driven)", () => {
  it("does NOT advance past Phase 1 when required fields are empty", async () => {
    const user = userEvent.setup();
    render(<RegistrationWizard />);

    // Phase 1 is shown.
    expect(screen.getByRole("heading", { name: /¿Quién es\?/i })).toBeInTheDocument();
    expect(screen.getByText(/Paso 1\/4/)).toBeInTheDocument();

    // Click Continuar without filling nombre/apellidos/fecha.
    await user.click(screen.getByRole("button", { name: /Continuar/i }));

    // Still on Phase 1 — the Contacto heading must NOT appear, and a
    // schema-driven error must surface on a required field.
    expect(screen.queryByRole("heading", { name: /¿Cómo la contactamos\?/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Paso 1\/4/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/El nombre es obligatorio/i)).toBeInTheDocument();
    });
  });

  it("advances to Phase 2 once required identity fields are valid", async () => {
    const user = userEvent.setup();
    render(<RegistrationWizard />);

    // Canal de llegada (required by Step0Schema) — open the Radix select.
    await user.click(screen.getByRole("combobox", { name: /Canal de llegada/i }));
    await user.click(await screen.findByRole("option", { name: /Boca a boca/i }));

    await user.type(screen.getByLabelText(/Nombre/i, { selector: "#nombre" }), "Mariana");
    await user.type(screen.getByLabelText(/Apellidos/i), "López Rivas");

    // fecha_nacimiento is a native date input.
    const fecha = document.querySelector<HTMLInputElement>("#fecha_nacimiento");
    expect(fecha).not.toBeNull();
    await user.type(fecha as HTMLInputElement, "1990-05-01");

    await user.click(screen.getByRole("button", { name: /Continuar/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /¿Cómo la contactamos\?/i })
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Paso 2\/4/)).toBeInTheDocument();
  });
});

describe("RegistrationWizard — consent-language fallback", () => {
  async function advanceToProgramaPhase(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("combobox", { name: /Canal de llegada/i }));
    await user.click(await screen.findByRole("option", { name: /Boca a boca/i }));
    await user.type(screen.getByLabelText(/Nombre/i, { selector: "#nombre" }), "Awa");
    await user.type(screen.getByLabelText(/Apellidos/i), "Diop Ndiaye");
    const fecha = document.querySelector<HTMLInputElement>("#fecha_nacimiento");
    await user.type(fecha as HTMLInputElement, "1992-03-10");
    // Phase 1 → 2
    await user.click(screen.getByRole("button", { name: /Continuar/i }));
    await screen.findByRole("heading", { name: /¿Cómo la contactamos\?/i });
    // Phase 2 → 3
    await user.click(screen.getByRole("button", { name: /Continuar/i }));
    await screen.findByRole("heading", { name: /Programa e información social/i });
  }

  it("shows the verbal-translation banner when idioma has no active template (wo)", async () => {
    const user = userEvent.setup();
    render(<RegistrationWizard />);

    // Set idioma_principal to Wolof (no template) in Phase 1.
    await user.click(screen.getByRole("combobox", { name: /Idioma principal/i }));
    await user.click(await screen.findByRole("option", { name: /Wolof/i }));

    await advanceToProgramaPhase(user);

    expect(screen.getByTestId("verbal-translation-banner")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("verbal-translation-banner")).getByText(/traducci[oó]n verbal/i)
    ).toBeInTheDocument();
  });

  it("does NOT show the banner when idioma is a template language (default es)", async () => {
    const user = userEvent.setup();
    render(<RegistrationWizard />);

    await advanceToProgramaPhase(user);

    expect(screen.queryByTestId("verbal-translation-banner")).not.toBeInTheDocument();
  });
});

describe("RegistrationWizard — Phase 3 program-count gate", () => {
  // Fills the Phase 1 identity fields and walks Phase 1 → 2 → 3. Mirrors the
  // fallback block's helper; kept local so this block is self-contained.
  async function advanceToProgramaPhase(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("combobox", { name: /Canal de llegada/i }));
    await user.click(await screen.findByRole("option", { name: /Boca a boca/i }));
    await user.type(screen.getByLabelText(/Nombre/i, { selector: "#nombre" }), "Mariana");
    await user.type(screen.getByLabelText(/Apellidos/i), "López Rivas");
    const fecha = document.querySelector<HTMLInputElement>("#fecha_nacimiento");
    await user.type(fecha as HTMLInputElement, "1990-05-01");
    // Phase 1 → 2
    await user.click(screen.getByRole("button", { name: /Continuar/i }));
    await screen.findByRole("heading", { name: /¿Cómo la contactamos\?/i });
    // Phase 2 → 3
    await user.click(screen.getByRole("button", { name: /Continuar/i }));
    await screen.findByRole("heading", { name: /Programa e información social/i });
  }

  it("does NOT advance to Resumen when no program is selected on Phase 3", async () => {
    const user = userEvent.setup();
    render(<RegistrationWizard />);

    await advanceToProgramaPhase(user);
    expect(screen.getByText(/Paso 3\/4/)).toBeInTheDocument();

    // Click Continuar with zero programs selected.
    await user.click(screen.getByRole("button", { name: /Continuar/i }));

    // Gate blocked: Resumen heading must NOT appear, indicator stays at 3/4,
    // and the toast.error fired.
    expect(
      screen.queryByRole("heading", { name: /Revisa antes de crear/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Paso 3\/4/)).toBeInTheDocument();
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/al menos un programa/i)
      );
    });
  });
});
