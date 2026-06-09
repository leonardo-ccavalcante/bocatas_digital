/**
 * HojaDrawer.test.tsx
 *
 * Contract tests for <HojaDrawer /> PDF preview modal before document generation.
 *
 * New contract (Batch 18):
 *   - Clicking "Generar Word" or "Generar PDF" calls previewPdf.fetch and shows a
 *     loading spinner, then an iframe with the PDF preview.
 *   - Clicking "Descargar Word/PDF" in the modal triggers the actual generation.
 *   - Clicking "Cancelar" in the modal does NOT trigger generation.
 *
 * Iron Law: these tests define the contract. Fix the component, never the test.
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

// No blob URL stubs needed — component now uses data: URLs directly

// ── tRPC mock ─────────────────────────────────────────────────────────────────
const { mockGetHojaUseQuery, mockGenerateDocxFetch, mockPreviewPdfFetch } =
  vi.hoisted(() => ({
    mockGetHojaUseQuery: vi.fn(),
    mockGenerateDocxFetch: vi.fn(),
    mockPreviewPdfFetch: vi.fn(),
  }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    derivar: {
      getHoja: { useQuery: mockGetHojaUseQuery },
      generateDocx: { fetch: mockGenerateDocxFetch },
      generatePdf: { fetch: vi.fn() },
      previewPdf: { fetch: mockPreviewPdfFetch },
      listTemplates: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false, error: null })),
      },
      uploadTemplate: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
    },
    useUtils: vi.fn(() => ({
      derivar: {
        generateDocx: { fetch: mockGenerateDocxFetch },
        generatePdf: { fetch: vi.fn() },
        previewPdf: { fetch: mockPreviewPdfFetch },
        listTemplates: { invalidate: vi.fn() },
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
      institucion_snapshot: { nombre: "Médicos del Mundo" },
    },
    {
      id: "iv-2",
      fecha: "2026-05-22",
      tipo_slug: "vivienda",
      descripcion: "Derivación a Cruz Roja",
      observaciones: null,
      firmado_url: null,
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

describe("HojaDrawer — PDF preview modal before document generation", () => {
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

  it("shows PDF iframe after previewPdf resolves", async () => {
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

    // Wait for iframe to appear
    await waitFor(() =>
      expect(screen.getByTitle(/vista previa del documento/i)).toBeInTheDocument(),
    );

    // iframe should have a data: URL (not blob: which Chrome blocks in iframes)
    const iframe = screen.getByTitle(/vista previa del documento/i);
    expect(iframe.getAttribute("src")).toMatch(/^data:application\/pdf;base64,/);
    expect(iframe.getAttribute("src")).toContain(fakePdfBase64);
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

    // Wait for iframe to appear (previewPdf resolved)
    await waitFor(() =>
      expect(screen.getByTitle(/vista previa del documento/i)).toBeInTheDocument(),
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
      expect(screen.getByTitle(/vista previa del documento/i)).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(mockGenerateDocxFetch).not.toHaveBeenCalled();
    // Modal should be closed
    expect(
      screen.queryByRole("dialog", { name: /vista previa/i }),
    ).not.toBeInTheDocument();
  });
});
