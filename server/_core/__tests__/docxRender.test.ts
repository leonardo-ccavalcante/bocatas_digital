/**
 * docxRender / pdfFromDocx contract tests.
 *
 * The canonical Derivar .docx template is a Bocatas-supplied asset not yet in
 * the repo or the Storage bucket, and LibreOffice is a deferred host dependency.
 * So the fully-testable behaviour today is the failure path: rendering must
 * raise a clear error when the template can't be downloaded. The happy path and
 * the PDF conversion are it.todo until those assets/infra land.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── vi.mock — must precede module import ─────────────────────────────────
const downloadMock = vi.fn();

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    storage: { from: vi.fn(() => ({ download: downloadMock })) },
  })),
  createServerClient: vi.fn(),
}));

import { renderDerivarHojaDocx, type DerivarHojaTemplateData } from "../docxRender";

const sampleData: DerivarHojaTemplateData = {
  nombre: "Raúl Uzcategui",
  numUnidadFamiliar: "2422",
  programaReferencia: "Programa de Familia",
  profesionalReferencia: "Sole",
  fechaApertura: "2026-05-20",
  intervenciones: [],
};

beforeEach(() => {
  downloadMock.mockReset();
});

describe("renderDerivarHojaDocx", () => {
  it("throws a clear error when the template download returns an error", async () => {
    downloadMock.mockResolvedValueOnce({ data: null, error: { message: "Object not found" } });
    await expect(renderDerivarHojaDocx(sampleData)).rejects.toThrow(/Could not load Derivar template/);
  });

  it("throws when the template download returns no file and no error", async () => {
    downloadMock.mockResolvedValueOnce({ data: null, error: null });
    await expect(renderDerivarHojaDocx(sampleData)).rejects.toThrow(/Could not load Derivar template/);
  });

  it.todo("renders the canonical template with header + intervention rows (needs derivacion_hoja_template_v1.docx)");
});

describe("convertDocxToPdf", () => {
  it.todo("(integration) converts a known-good .docx to PDF when libreoffice is available");
});
