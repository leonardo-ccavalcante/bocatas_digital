/**
 * pdfGen.generatePdf.test.ts
 *
 * TDD test for PDF generation without LibreOffice.
 * Tests that convertDocxToPdfPureNode is used instead of convertDocxToPdf.
 */

import { describe, it, expect, vi } from "vitest";
import { convertDocxToPdfPureNode } from "../../../_core/pdfFromDocxPureNode";
import { renderDerivarHojaDocx } from "../../../_core/docxRender";

// DIO-04: exercise REAL docx→pdf rendering against the committed template fixture,
// not a live Supabase. Without this the template "download" hits http://localhost
// and hangs until the 5s test timeout in CI (no DB) — a false-red integration
// dependency in what is really a rendering unit test.
vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(async () => {
          const { readFileSync } = await import("node:fs");
          const { resolve } = await import("node:path");
          const buf = readFileSync(
            resolve(
              process.cwd(),
              "server/_core/__fixtures__/derivacion_hoja_template_v3.docx",
            ),
          );
          return { data: new Blob([buf]), error: null };
        }),
      })),
    },
  })),
}));

const testData = {
  nombre: "Test User",
  numUnidadFamiliar: "123",
  programaReferencia: "Test Program",
  profesionalReferencia: "Test Professional",
  fechaApertura: "9/6/2026",
  intervenciones: [],
};

describe("PDF generation without LibreOffice", () => {
  it("converts DOCX to PDF using pdfkit (no LibreOffice required)", async () => {
    // Generate a test DOCX
    const docxBuf = await renderDerivarHojaDocx(testData);
    expect(docxBuf).toBeDefined();
    expect(Buffer.isBuffer(docxBuf)).toBe(true);
    
    // Convert to PDF using pure Node.js (no LibreOffice)
    const pdfBuf = await convertDocxToPdfPureNode(docxBuf, {
      title: "Hoja de Derivaciones",
    });
    
    // Verify PDF is valid
    expect(Buffer.isBuffer(pdfBuf)).toBe(true);
    expect(pdfBuf.length).toBeGreaterThan(0);
    
    // Verify PDF header
    const pdfHeader = pdfBuf.toString("utf8", 0, 4);
    expect(pdfHeader).toBe("%PDF");
  });

  it("PDF generation completes without ENOENT error", async () => {
    const docxBuf = await renderDerivarHojaDocx(testData);
    // This should NOT throw ENOENT: no such file or directory
    const pdfBuf = await convertDocxToPdfPureNode(docxBuf);
    
    // Verify PDF is valid
    expect(Buffer.isBuffer(pdfBuf)).toBe(true);
    expect(pdfBuf.length).toBeGreaterThan(0);
    const pdfHeader = pdfBuf.toString("utf8", 0, 4);
    expect(pdfHeader).toBe("%PDF");
  });

  it("handles empty interventions gracefully", async () => {
    const dataWithNoInterventions = {
      ...testData,
      intervenciones: [],
    };
    
    const docxBuf = await renderDerivarHojaDocx(dataWithNoInterventions);
    const pdfBuf = await convertDocxToPdfPureNode(docxBuf);
    
    expect(Buffer.isBuffer(pdfBuf)).toBe(true);
    const pdfHeader = pdfBuf.toString("utf8", 0, 4);
    expect(pdfHeader).toBe("%PDF");
  });
});
