/**
 * HojaDrawer.test.tsx
 *
 * Contract tests for <HojaDrawer /> — Batch 20 updated contract:
 *
 * Preview contract (Batch 20):
 *   - Clicking "Generar Word" or "Generar PDF" calls previewPdf.fetch and shows a
 *     loading spinner, then an <object> element with a blob: URL.
 *   - Chrome blocks data: URLs in iframes; we now use blob: URLs in <object> tags.
 *   - Clicking "Descargar Word/PDF" in the modal triggers the actual generation.
 *   - Clicking "Cancelar" in the modal does NOT trigger generation.
 *
 * New features (Batch 20):
 *   - excludeIntervention: trash button on each intervention row opens a confirm dialog.
 *   - uploadSignedHoja: "Subir hoja firmada" button opens an upload modal.
 *   - activateTemplate: "Usar esta" button in template modal activates a template.
 *   - listTemplates returns { templates, activeTemplate } shape.
 */

import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── jsdom stubs ───────────────────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

// Stub URL.createObjectURL / revokeObjectURL (jsdom doesn't implement them)
const mockBlobUrl = "blob:http://localhost/fake-pdf-preview";
global.URL.createObjectURL = vi.fn(() => mockBlobUrl);
global.URL.revokeObjectURL = vi.fn();

// ── tRPC mock ─────────────────────────────────────────────────────────────────
const {
  mockGetHojaUseQuery,
  mockGenerateDocxFetch,
  mockPreviewPdfFetch,
  mockActivateTemplateMutate,
  mockExcludeInterventionMutate,
  mockUploadSignedHojaMutate,
} = vi.hoisted(() => ({
  mockGetHojaUseQuery: vi.fn(),
  mockGenerateDocxFetch: vi.fn(),
  mockPreviewPdfFetch: vi.fn(),
  mockActivateTemplateMutate: vi.fn(),
  mockExcludeInterventionMutate: vi.fn(),
  mockUploadSignedHojaMutate: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    derivar: {
      getHoja: { useQuery: mockGetHojaUseQuery },
      generateDocx: { fetch: mockGenerateDocxFetch },
      generatePdf: { fetch: vi.fn() },
      previewPdf: { fetch: mockPreviewPdfFetch },
      listTemplates: {
        useQuery: vi.fn(() => ({
          data: { templates: [], activeTemplate: null },
          isLoading: false,
          error: null,
        })),
      },
      uploadTemplate: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      activateTemplate: {
        useMutation: vi.fn(() => ({
          mutate: mockActivateTemplateMutate,
          isPending: false,
        })),
      },
      uploadSecondaryLogo: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      excludeIntervention: {
        useMutation: vi.fn(() => ({
          mutate: mockExcludeInterventionMutate,
          isPending: false,
        })),
      },
      uploadSignedHoja: {
        useMutation: vi.fn(() => ({
          mutate: mockUploadSignedHojaMutate,
          isPending: false,
        })),
      },
    },
    useUtils: vi.fn(() => ({
      derivar: {
        generateDocx: { fetch: mockGenerateDocxFetch },
        generatePdf: { fetch: vi.fn() },
        previewPdf: { fetch: mockPreviewPdfFetch },
        listTemplates: { invalidate: vi.fn() },
        getHoja: { invalidate: vi.fn() },
      },
    })),
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { HojaDrawer } from "../HojaDrawer";

const sampleHoja = {
  hoja: {
    id: "hoja-1",
    scope: "persona",
    fecha_apertura: "2026-05-20",
    profesional_nombre: "Sole",
    firmado_url: null,
    persona: { nombre: "Raúl", apellidos: "Uzcategui" },
    familia: null,
    programa: { name: "Programa Familias" },
  },
  intervenciones: [
    {
      id: "iv-1",
      fecha: "2026-05-21",
      tipo_slug: "salud",
      descripcion: "Derivación a MdM",
      observaciones: null,
      firmado_url: null,
      excluded_at: null,
      institucion_snapshot: { nombre: "Médicos del Mundo" },
    },
    {
      id: "iv-2",
      fecha: "2026-05-22",
      tipo_slug: "vivienda",
      descripcion: "Derivación a Cruz Roja",
      observaciones: null,
      firmado_url: null,
      excluded_at: null,
      institucion_snapshot: { nombre: "Cruz Roja" },
    },
  ],
};

// Fake PDF base64 (minimal valid-ish base64 string)
const fakePdfBase64 = btoa("%PDF-1.4 fake");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HojaDrawer — PDF preview modal (Batch 20: blob URL via <object>)", () => {
  it("shows a preview modal with loading spinner when 'Generar Word' is clicked", async () => {
    mockGetHojaUseQuery.mockReturnValue({
      data: sampleHoja,
      isLoading: false,
      error: null,
    });
    // previewPdf never resolves in this test (we check loading state)
    mockPreviewPdfFetch.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    render(
      <HojaDrawer
        hojaId="hoja-1"
        onClose={vi.fn()}
        onAddIntervention={vi.fn()}
      />,
    );

    const generateBtn = screen.getByRole("button", { name: /generar word/i });
    await user.click(generateBtn);

    // Preview modal should appear
    expect(
      screen.getByRole("dialog", { name: /vista previa/i }),
    ).toBeInTheDocument();

    // Loading spinner should be visible while previewPdf is pending
    expect(
      screen.getByLabelText(/cargando vista previa/i),
    ).toBeInTheDocument();

    // previewPdf.fetch should have been called
    expect(mockPreviewPdfFetch).toHaveBeenCalledWith({ hojaId: "hoja-1" });
  });

  it("shows PDF <object> with blob: URL after previewPdf resolves", async () => {
    mockGetHojaUseQuery.mockReturnValue({
      data: sampleHoja,
      isLoading: false,
      error: null,
    });
    mockPreviewPdfFetch.mockResolvedValue({
      contentBase64: fakePdfBase64,
      mime: "application/pdf",
    });

    const user = userEvent.setup();
    render(
      <HojaDrawer
        hojaId="hoja-1"
        onClose={vi.fn()}
        onAddIntervention={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /generar word/i }));

    // Wait for the <object> element to appear (previewPdf resolved)
    await waitFor(() =>
      expect(screen.getByLabelText(/vista previa pdf/i)).toBeInTheDocument(),
    );

    // Should use blob: URL (not data: which Chrome blocks in iframes)
    const obj = screen.getByLabelText(/vista previa pdf/i);
    expect(obj.getAttribute("data")).toBe(mockBlobUrl);
    expect(obj.tagName.toLowerCase()).toBe("object");

    // URL.createObjectURL should have been called with a Blob
    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
    const arg = (global.URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg).toBeInstanceOf(Blob);
    expect(arg.type).toBe("application/pdf");
  });

  it("calls generateDocx.fetch only after confirming in the preview modal", async () => {
    mockGetHojaUseQuery.mockReturnValue({
      data: sampleHoja,
      isLoading: false,
      error: null,
    });
    mockPreviewPdfFetch.mockResolvedValue({
      contentBase64: fakePdfBase64,
      mime: "application/pdf",
    });
    mockGenerateDocxFetch.mockResolvedValue({
      contentBase64: btoa("fake-docx"),
      filename: "test.docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const user = userEvent.setup();
    render(
      <HojaDrawer
        hojaId="hoja-1"
        onClose={vi.fn()}
        onAddIntervention={vi.fn()}
      />,
    );

    // Click "Generar Word" — should show modal, NOT call generateDocx.fetch yet
    await user.click(screen.getByRole("button", { name: /generar word/i }));
    expect(mockGenerateDocxFetch).not.toHaveBeenCalled();

    // Wait for <object> to appear (previewPdf resolved)
    await waitFor(() =>
      expect(screen.getByLabelText(/vista previa pdf/i)).toBeInTheDocument(),
    );

    // Confirm in modal — should call generateDocx.fetch
    await user.click(screen.getByRole("button", { name: /descargar word/i }));
    await waitFor(() =>
      expect(mockGenerateDocxFetch).toHaveBeenCalledTimes(1),
    );
  });

  it("does NOT call generateDocx.fetch when 'Cancelar' is clicked in the modal", async () => {
    mockGetHojaUseQuery.mockReturnValue({
      data: sampleHoja,
      isLoading: false,
      error: null,
    });
    mockPreviewPdfFetch.mockResolvedValue({
      contentBase64: fakePdfBase64,
      mime: "application/pdf",
    });

    const user = userEvent.setup();
    render(
      <HojaDrawer
        hojaId="hoja-1"
        onClose={vi.fn()}
        onAddIntervention={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /generar word/i }));
    await waitFor(() =>
      expect(screen.getByLabelText(/vista previa pdf/i)).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(mockGenerateDocxFetch).not.toHaveBeenCalled();
    // Modal should be closed
    expect(
      screen.queryByRole("dialog", { name: /vista previa/i }),
    ).not.toBeInTheDocument();
    // Blob URL should be revoked
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(mockBlobUrl);
  });
});

describe("HojaDrawer — Exclude intervention (Batch 20)", () => {
  beforeEach(() => {
    mockGetHojaUseQuery.mockReturnValue({
      data: sampleHoja,
      isLoading: false,
      error: null,
    });
  });

  it("opens exclude confirmation dialog when trash button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <HojaDrawer
        hojaId="hoja-1"
        onClose={vi.fn()}
        onAddIntervention={vi.fn()}
      />,
    );

    // Click the first exclude button
    const excludeBtns = screen.getAllByRole("button", { name: /excluir intervención/i });
    await user.click(excludeBtns[0]);

    // Confirm dialog should appear
    expect(
      screen.getByRole("dialog", { name: /excluir intervención/i }),
    ).toBeInTheDocument();
  });

  it("calls excludeIntervention.mutate with reason when confirmed", async () => {
    const user = userEvent.setup();
    render(
      <HojaDrawer
        hojaId="hoja-1"
        onClose={vi.fn()}
        onAddIntervention={vi.fn()}
      />,
    );

    const excludeBtns = screen.getAllByRole("button", { name: /excluir intervención/i });
    await user.click(excludeBtns[0]);

    // Type reason
    const reasonInput = screen.getByTestId("exclude-reason-input");
    await user.type(reasonInput, "Error de registro");

    // Confirm
    await user.click(screen.getByTestId("confirm-exclude-btn"));

    expect(mockExcludeInterventionMutate).toHaveBeenCalledWith({
      intervencionId: "iv-1",
      reason: "Error de registro",
    });
  });

  it("does NOT call excludeIntervention.mutate when reason is empty", async () => {
    const user = userEvent.setup();
    render(
      <HojaDrawer
        hojaId="hoja-1"
        onClose={vi.fn()}
        onAddIntervention={vi.fn()}
      />,
    );

    const excludeBtns = screen.getAllByRole("button", { name: /excluir intervención/i });
    await user.click(excludeBtns[0]);

    // Confirm button should be disabled when reason is empty
    const confirmBtn = screen.getByTestId("confirm-exclude-btn");
    expect(confirmBtn).toBeDisabled();
  });
});

describe("HojaDrawer — Upload signed hoja (Batch 20)", () => {
  it("opens upload signed hoja modal when button is clicked", async () => {
    mockGetHojaUseQuery.mockReturnValue({
      data: sampleHoja,
      isLoading: false,
      error: null,
    });

    const user = userEvent.setup();
    render(
      <HojaDrawer
        hojaId="hoja-1"
        onClose={vi.fn()}
        onAddIntervention={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /subir hoja firmada/i }));

    expect(
      screen.getByRole("dialog", { name: /subir hoja firmada/i }),
    ).toBeInTheDocument();
  });
});

describe("HojaDrawer — Template management (Batch 20)", () => {
  it("shows listTemplates with { templates, activeTemplate } shape", async () => {
    const mockTemplates = [
      { name: "plantilla_v1.docx", size: 12345, isActive: false },
      { name: "plantilla_v2.docx", size: 23456, isActive: true },
    ];

    mockGetHojaUseQuery.mockReturnValue({
      data: sampleHoja,
      isLoading: false,
      error: null,
    });

    // Override listTemplates mock for this test
    const { trpc } = await import("@/lib/trpc");
    (trpc.derivar.listTemplates.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { templates: mockTemplates, activeTemplate: "plantilla_v2.docx" },
      isLoading: false,
      error: null,
    });

    const user = userEvent.setup();
    render(
      <HojaDrawer
        hojaId="hoja-1"
        onClose={vi.fn()}
        onAddIntervention={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /cambiar plantilla/i }));

    // Both templates should be listed
    expect(screen.getByText("plantilla_v1.docx")).toBeInTheDocument();
    expect(screen.getByText("plantilla_v2.docx")).toBeInTheDocument();

    // "Usar esta" button should only appear for inactive template
    const usarBtns = screen.getAllByRole("button", { name: /usar plantilla/i });
    expect(usarBtns).toHaveLength(1);
  });
});
