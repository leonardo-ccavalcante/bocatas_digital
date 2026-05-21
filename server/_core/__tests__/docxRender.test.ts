/**
 * docxRender / pdfFromDocx contract tests.
 *
 * The canonical Derivar .docx template is a Bocatas-supplied asset not yet in
 * the repo or the Storage bucket, and LibreOffice is a deferred host dependency.
 * So the fully-testable behaviour today is the failure path: rendering must
 * raise a clear error when the template can't be downloaded. The happy path and
 * the PDF conversion are it.todo until those assets/infra land.
 */

import { readFileSync } from "node:fs";

import PizZip from "pizzip";
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

  it("renders the template with header + looped intervention rows", async () => {
    const fixture = readFileSync(
      "server/_core/__fixtures__/derivacion_hoja_template_v1.docx",
    );
    downloadMock.mockResolvedValueOnce({
      data: { arrayBuffer: async () => new Uint8Array(fixture).buffer },
      error: null,
    });

    const buf = await renderDerivarHojaDocx({
      ...sampleData,
      intervenciones: [
        {
          fecha: "21/05/2026",
          tipo: "Salud",
          descripcion: "Derivación a MdM",
          recursoNombre: "Médicos del Mundo",
          recursoDireccion: "",
          recursoTelefono: "",
          observaciones: "",
          firmaPlaceholder: "",
        },
      ],
    });

    const xml = new PizZip(buf).file("word/document.xml")!.asText();
    expect(xml).toContain("Raúl Uzcategui"); // header placeholder filled
    expect(xml).toContain("Médicos del Mundo"); // looped row rendered
  });
});

describe("convertDocxToPdf", () => {
  it.todo("(integration) converts a known-good .docx to PDF when libreoffice is available");
});
