/**
 * MYTHOS: MYT-135B
 *
 * server/routers/ocr.ts:107-110,120 prompts + JSON-schemas the LLM to return a
 * `genero` field (and MYT-135A taught OCRResultSchema.data to keep that key
 * instead of stripping it — see related.ts `genero: GeneroSchema.nullish()
 * .catch(undefined)`). But handleOCRExtracted in RegistrationWizard/index.tsx
 * (the OCR → form-field mapping callback) never reads `data.genero` — every
 * other field (nombre, apellidos, fecha_nacimiento, numero_documento,
 * tipo_documento, pais_documento) is mapped into the form via `setValue`, but
 * genero is silently dropped. The extraction work done server-side for this
 * field is thrown away.
 *
 * This test drives the real <RegistrationWizard /> (Phase 1 = Identidad,
 * default phase), simulates an OCR extraction that includes a valid
 * `genero: "masculino"`, and asserts the Género field actually receives it.
 *
 * Heavy dependencies (tRPC network hooks, wouter routing, the OCR capture
 * widget's camera/file UI, and the Radix Select popover machinery) are
 * replaced with minimal stand-ins so the test exercises the real
 * `handleOCRExtracted` closure — the actual bug site — not a re-implementation
 * of it. The `@/components/ui/select` mock mirrors the established pattern of
 * mocking Radix-portal-based shadcn primitives in jsdom (see
 * ConsentModal.fallback.test.tsx's `@/components/ui/dialog` mock): it keeps
 * the controlled `value`/`onValueChange` wiring from SelectField (app code,
 * untouched) but replaces the underlying popover with something inspectable
 * without opening a portal.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { OcrExtracted } from "../../../schemas";

// ── wouter ──────────────────────────────────────────────────────────────────
vi.mock("wouter", () => ({
  useLocation: () => ["/personas/nueva", vi.fn()],
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}));

// ── tRPC — every hook reached while rendering Phase 1 (Identidad) plus the
// hooks constructed eagerly by useRegistrationSubmit / useCreatePerson /
// useEnrollPerson, none of which fire in this test (no submit click). ───────
vi.mock("@/lib/trpc", () => ({
  trpc: {
    // useRegistrationSubmit ahora consulta el rol vía useAuth para elegir el
    // destino tras registrar, y useAuth usa useUtils + auth.me/auth.logout.
    useUtils: () => ({ auth: { me: { setData: vi.fn(), invalidate: vi.fn() } } }),
    auth: {
      me: { useQuery: () => ({ data: null, isLoading: false, error: null, refetch: vi.fn() }) },
      logout: { useMutation: () => ({ isPending: false, error: null, mutate: vi.fn() }) },
    },
    persons: {
      programs: { useQuery: () => ({ data: [], isLoading: false }) },
      consentTemplates: { useQuery: () => ({ data: [], isLoading: false }) },
      findDuplicates: { useQuery: () => ({ data: [], isLoading: false }) },
      create: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
      enroll: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
      saveConsents: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      createFamily: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      uploadPhoto: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
    // Step0Canal ahora monta InstitucionTypeahead (Task 4): su búsqueda y el
    // modal de creación consultan instituciones.*.
    instituciones: {
      search: { useQuery: () => ({ data: [] }) },
      create: { useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }) },
    },
    ocr: {
      extractDocument: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

// ── DocumentCaptureInline — replaced with a single button that fires the
// SAME onExtracted callback the real widget calls on successful OCR
// (DocumentCaptureInline.tsx `handleExtract` → `onExtracted(result.data)`).
// This isolates the test to the mapping bug in handleOCRExtracted (index.tsx)
// instead of also having to drive the camera/file-upload/mutation UI.
// En MAYÚSCULAS, como los devuelve el OCR real (Task 6): las aserciones de
// nombre/apellidos de abajo prueban además la normalización titleCaseEs.
const OCR_FIXTURE: OcrExtracted = {
  nombre: "FATIMA",
  apellidos: "EL AMRANI",
  fecha_nacimiento: "1990-05-12",
  tipo_documento: "documento_extranjero",
  numero_documento: "AB123456",
  pais_origen: "MA",
  pais_documento: "MA",
  genero: "masculino",
};
vi.mock("../../DocumentCaptureInline", () => ({
  DocumentCaptureInline: ({ onExtracted }: { onExtracted: (d: OcrExtracted) => void }) => (
    <button type="button" data-testid="mock-ocr-extract" onClick={() => onExtracted(OCR_FIXTURE)}>
      Mock extract
    </button>
  ),
}));

// ── Radix Select stand-in — keeps SelectField's real value/onValueChange
// wiring inspectable without a portal-mounted popover (jsdom + Radix Select
// needs pointer-capture/ResizeObserver shims and only portals the selected
// item's label into the trigger once opened at least once — irrelevant noise
// for this test). `data-current-value` exposes the controlled value that
// SelectField (untouched app code) passes down from `watch("genero")`.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, children }: { value: string; children?: ReactNode }) => (
    <div data-current-value={value}>{children}</div>
  ),
  SelectTrigger: ({ id, children }: { id?: string; children?: ReactNode }) => (
    <button type="button" id={id}>{children}</button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

// Import AFTER mocks are registered.
import { RegistrationWizard } from "../index";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWizard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RegistrationWizard />
    </QueryClientProvider>,
  );
}

describe("MYT-135B — OCR genero is extracted but discarded", () => {
  it("carries an OCR-extracted genero into the Género field", async () => {
    const user = userEvent.setup();
    const { container } = renderWizard();

    // Phase 1 (Identidad) mounts two DocumentCaptureInline stubs (Step1Identidad
    // + Step2Documento, both empty at start) — either one exercises the SAME
    // handleOCRExtracted closure passed down from index.tsx.
    const extractButtons = screen.getAllByTestId("mock-ocr-extract");
    await user.click(extractButtons[0]);

    const generoTrigger = container.querySelector("#genero");
    expect(generoTrigger, "expected the Género SelectTrigger (#genero) to render").not.toBeNull();
    const generoValueHost = generoTrigger?.closest("[data-current-value]");

    // RED (current behavior, MYT-135B): handleOCRExtracted only maps nombre,
    // apellidos, fecha_nacimiento, numero_documento, tipo_documento and
    // pais_documento — genero is never read from the OCR result, so the
    // Género field's controlled value stays empty even though the OCR
    // response carried a valid, canonical `genero: "masculino"`.
    expect(generoValueHost?.getAttribute("data-current-value")).toBe("masculino");

    // Sanity check: the OTHER OCR-mapped fields DID make it through, proving
    // this is a genero-specific gap, not a broken fixture/mock/mapping wiring.
    expect(screen.getByLabelText(/^nombre/i)).toHaveValue("Fatima");
    expect(screen.getByLabelText(/^apellidos/i)).toHaveValue("El Amrani");
  });
});
