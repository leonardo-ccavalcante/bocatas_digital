/**
 * HojaDrawer.templateModal.test.tsx
 *
 * TDD tests for the template management modal in <HojaDrawer />.
 *
 * Contract:
 *   - Clicking "Cambiar plantilla" opens a Dialog with aria-label "Gestión de plantillas".
 *   - The modal lists templates from listTemplates.useQuery when open.
 *   - Selecting a file enables the "Subir plantilla" button.
 *   - Clicking "Subir plantilla" calls uploadTemplate.mutate with base64 + originalName.
 *   - On success, a success toast is shown and the file input is cleared.
 *   - On error, an error toast is shown.
 *   - Clicking "Cerrar" closes the modal.
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── jsdom stubs ───────────────────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

// ── tRPC mock ─────────────────────────────────────────────────────────────────
const {
  mockGetHojaUseQuery,
  mockPreviewPdfFetch,
  mockListTemplatesUseQuery,
  mockUploadTemplateMutate,
  mockUploadTemplateMutation,
  mockListTemplatesInvalidate,
} = vi.hoisted(() => {
  const mockUploadTemplateMutate = vi.fn();
  const mockListTemplatesInvalidate = vi.fn();
  const mockUploadTemplateMutation = vi.fn(() => ({
    mutate: mockUploadTemplateMutate,
    isPending: false,
  }));
  return {
    mockGetHojaUseQuery: vi.fn(),
    mockPreviewPdfFetch: vi.fn(),
    mockListTemplatesUseQuery: vi.fn(),
    mockUploadTemplateMutate,
    mockUploadTemplateMutation,
    mockListTemplatesInvalidate,
  };
});

vi.mock("@/lib/trpc", () => ({
  trpc: {
    derivar: {
      getHoja: { useQuery: mockGetHojaUseQuery },
      generateDocx: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
      generatePdf: {
        useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
      },
      previewPdf: { fetch: mockPreviewPdfFetch },
      listTemplates: {
        useQuery: mockListTemplatesUseQuery,
      },
      uploadTemplate: {
        useMutation: mockUploadTemplateMutation,
      },
      activateTemplate: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      uploadSecondaryLogo: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      excludeIntervention: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      uploadSignedHoja: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
    },
    useUtils: vi.fn(() => ({
      derivar: {
        previewPdf: { fetch: mockPreviewPdfFetch },
        listTemplates: { invalidate: mockListTemplatesInvalidate },
        getHoja: { invalidate: vi.fn() },
      },
    })),
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { HojaDrawer } from "../HojaDrawer";
import { toast } from "sonner";

const sampleHoja = {
  hoja: {
    id: "hoja-1",
    scope: "persona",
    fecha_apertura: "2026-05-20",
    profesional_nombre: "Sole",
    persona: { nombre: "Raúl", apellidos: "Uzcategui" },
    familia: null,
    programa: { name: "Programa Familias" },
  },
  intervenciones: [],
};

const sampleTemplates = [
  { name: "derivacion_hoja_template_v3.docx", size: 12345, updatedAt: "2026-01-01" },
  { name: "derivacion_hoja_template_custom_abc.docx", size: 9876, updatedAt: "2026-02-01" },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HojaDrawer — template management modal", () => {
  it("opens template modal when 'Cambiar plantilla' is clicked", async () => {
    mockGetHojaUseQuery.mockReturnValue({
      data: sampleHoja,
      isLoading: false,
      error: null,
    });
    mockListTemplatesUseQuery.mockReturnValue({
      data: { templates: [], activeTemplate: null },
      isLoading: false,
      error: null,
    });
    mockUploadTemplateMutation.mockReturnValue({
      mutate: mockUploadTemplateMutate,
      isPending: false,
    });

    const user = userEvent.setup();
    render(
      <HojaDrawer
        hojaId="hoja-1"
        onClose={vi.fn()}
        onAddIntervention={vi.fn()}
      />,
    );

    const btn = screen.getByRole("button", { name: /cambiar plantilla/i });
    await user.click(btn);

    // Template modal should appear
    expect(
      screen.getByRole("dialog", { name: /gesti[oó]n de plantillas/i }),
    ).toBeInTheDocument();
  });

  it("lists available templates in the modal", async () => {
    mockGetHojaUseQuery.mockReturnValue({
      data: sampleHoja,
      isLoading: false,
      error: null,
    });
    mockListTemplatesUseQuery.mockReturnValue({
      data: { templates: sampleTemplates, activeTemplate: null },
      isLoading: false,
      error: null,
    });
    mockUploadTemplateMutation.mockReturnValue({
      mutate: mockUploadTemplateMutate,
      isPending: false,
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
    expect(
      screen.getByText(/derivacion_hoja_template_v3\.docx/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/derivacion_hoja_template_custom_abc\.docx/i),
    ).toBeInTheDocument();
  });

  it("upload button is disabled when no file is selected", async () => {
    mockGetHojaUseQuery.mockReturnValue({
      data: sampleHoja,
      isLoading: false,
      error: null,
    });
    mockListTemplatesUseQuery.mockReturnValue({
      data: { templates: [], activeTemplate: null },
      isLoading: false,
      error: null,
    });
    mockUploadTemplateMutation.mockReturnValue({
      mutate: mockUploadTemplateMutate,
      isPending: false,
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

    const uploadBtn = screen.getByRole("button", { name: /subir plantilla/i });
    expect(uploadBtn).toBeDisabled();
  });

  it("calls uploadTemplate.mutate with correct base64 and filename when file is uploaded", async () => {
    mockGetHojaUseQuery.mockReturnValue({
      data: sampleHoja,
      isLoading: false,
      error: null,
    });
    mockListTemplatesUseQuery.mockReturnValue({
      data: { templates: [], activeTemplate: null },
      isLoading: false,
      error: null,
    });
    mockUploadTemplateMutation.mockReturnValue({
      mutate: mockUploadTemplateMutate,
      isPending: false,
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

    // Simulate file selection — create a fake DOCX-like file (ZIP magic bytes PK)
    const fakeDocxContent = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);
    const fakeFile = new File([fakeDocxContent], "mi_plantilla.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const fileInput = screen.getByTestId("template-file-input");
    await user.upload(fileInput, fakeFile);

    // Upload button should now be enabled
    const uploadBtn = screen.getByRole("button", { name: /subir plantilla/i });
    expect(uploadBtn).not.toBeDisabled();

    // Click upload
    await user.click(uploadBtn);

    // uploadTemplate.mutate should have been called with base64 + originalName
    await waitFor(() => {
      expect(mockUploadTemplateMutate).toHaveBeenCalledTimes(1);
    });
    const callArg = mockUploadTemplateMutate.mock.calls[0][0];
    expect(callArg).toHaveProperty("originalName", "mi_plantilla.docx");
    expect(callArg).toHaveProperty("fileBase64");
    expect(typeof callArg.fileBase64).toBe("string");
    expect(callArg.fileBase64.length).toBeGreaterThan(0);
  });

  it("closes the template modal when 'Cerrar' is clicked", async () => {
    mockGetHojaUseQuery.mockReturnValue({
      data: sampleHoja,
      isLoading: false,
      error: null,
    });
    mockListTemplatesUseQuery.mockReturnValue({
      data: { templates: [], activeTemplate: null },
      isLoading: false,
      error: null,
    });
    mockUploadTemplateMutation.mockReturnValue({
      mutate: mockUploadTemplateMutate,
      isPending: false,
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
    expect(
      screen.getByRole("dialog", { name: /gesti[oó]n de plantillas/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cerrar/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /gesti[oó]n de plantillas/i }),
      ).not.toBeInTheDocument();
    });
  });
});
