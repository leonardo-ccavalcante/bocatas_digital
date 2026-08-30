/**
 * Tests for <DocxPreviewModal /> — faithful preview of the generated informe.
 * The server converts the .docx to PDF; the modal paints it to <canvas> via
 * pdf.js (plugin-independent, works in the VSCode browser + mobile where
 * <iframe>/<object> fail). It must: show a loading state, expose a PDF download,
 * NEVER use <iframe>/<object> (both download/blank in Chrome/mobile), and
 * degrade gracefully when PDF conversion is unavailable.
 */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver ?? ResizeObserverStub;

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock-pdf");
  URL.revokeObjectURL = vi.fn();
});

// pdf.js is dynamically imported inside the render effect — stub it so jsdom
// never loads the real (heavy) library.
vi.mock("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url", () => ({ default: "blob:worker" }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: () =>
        Promise.resolve({
          getViewport: () => ({ width: 200, height: 300 }),
          render: () => ({ promise: Promise.resolve() }),
        }),
    }),
  }),
}));

const signedMock = vi.fn().mockResolvedValue("https://sb/signed.docx");
vi.mock("@/features/families/utils/signedUrl", () => ({
  getSignedDocUrl: (p: string) => signedMock(p),
}));

type QueryState = {
  isPending: boolean;
  isError: boolean;
  data?: { pdfBase64: string };
  error: { data?: { code?: string } } | null;
};
let pdfState: QueryState = { isPending: true, isError: false, error: null };
vi.mock("@/lib/trpc", () => ({
  trpc: {
    families: { getSocialReportPdf: { useQuery: () => pdfState } },
  },
}));

import DocxPreviewModal from "../DocxPreviewModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const PATH = "fam/-1/informe_valoracion_social/x.docx";

describe("<DocxPreviewModal /> (pdf.js canvas preview)", () => {
  it("shows a loading state while the PDF is generating", () => {
    pdfState = { isPending: true, isError: false, error: null };
    render(<DocxPreviewModal open docPath={PATH} onOpenChange={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent(/generando vista previa/i);
  });

  it("exposes a PDF download and NEVER uses <iframe>/<object> (both fail in Chrome/mobile)", async () => {
    pdfState = { isPending: false, isError: false, data: { pdfBase64: btoa("%PDF-1.7") }, error: null };
    render(<DocxPreviewModal open docPath={PATH} onOpenChange={() => {}} />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /descargar pdf/i })).toHaveAttribute("href", "blob:mock-pdf");
    });
    // Dialog portals to document.body — assert plugin-dependent embeds are absent.
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.querySelector("object")).toBeNull();
  });

  it("falls back to a message + DOCX download when PDF is unavailable on the host", () => {
    pdfState = { isPending: false, isError: true, error: { data: { code: "PRECONDITION_FAILED" } } };
    render(<DocxPreviewModal open docPath={PATH} onOpenChange={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/no puede convertir el informe a PDF/i);
    expect(screen.getByRole("button", { name: /descargar docx/i })).toBeInTheDocument();
  });
});

// ── FAMILIAS-4a: la descarga en PDF no puede fallar en silencio ──────────────
//
// «No deja descargar el informe en pdf»: el botón se pintaba como <Button asChild
// disabled><a href={undefined}> — `disabled` no existe en un <a>, así que el
// control quedaba clicable y no hacía absolutamente nada. Sin PDF debe haber un
// botón REALMENTE deshabilitado y un motivo accionable, nunca un enlace muerto.

describe("<DocxPreviewModal /> — descarga en PDF (FAMILIAS-4)", () => {
  it("sin PDF disponible NO renderiza un enlace muerto de «Descargar PDF»", () => {
    pdfState = { isPending: false, isError: true, error: { data: { code: "PRECONDITION_FAILED" } } };
    render(<DocxPreviewModal open docPath={PATH} onOpenChange={() => {}} />);

    expect(screen.queryByRole("link", { name: /descargar pdf/i })).toBeNull();
    expect(screen.getByRole("button", { name: /descargar pdf/i })).toBeDisabled();
  });

  it("explica QUÉ falta y qué hacer cuando el servidor no puede convertir a PDF", () => {
    pdfState = { isPending: false, isError: true, error: { data: { code: "PRECONDITION_FAILED" } } };
    render(<DocxPreviewModal open docPath={PATH} onOpenChange={() => {}} />);

    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent(/libreoffice/i);
    expect(alerta).toHaveTextContent(/equipo técnico/i);
  });

  it("mientras carga tampoco hay enlace de descarga en PDF", () => {
    pdfState = { isPending: true, isError: false, error: null };
    render(<DocxPreviewModal open docPath={PATH} onOpenChange={() => {}} />);

    expect(screen.queryByRole("link", { name: /descargar pdf/i })).toBeNull();
    expect(screen.getByRole("button", { name: /descargar pdf/i })).toBeDisabled();
  });

  it("con PDF disponible sí hay enlace real de descarga", async () => {
    pdfState = { isPending: false, isError: false, data: { pdfBase64: btoa("%PDF-1.7") }, error: null };
    render(<DocxPreviewModal open docPath={PATH} onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /descargar pdf/i })).toHaveAttribute(
        "href",
        "blob:mock-pdf",
      );
    });
  });
});
