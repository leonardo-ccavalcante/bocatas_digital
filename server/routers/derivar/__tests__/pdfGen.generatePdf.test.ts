/**
 * pdfGen.generatePdf.test.ts
 *
 * TDD test for PDF generation without LibreOffice.
 * Tests that convertDocxToPdfPureNode is used instead of convertDocxToPdf.
 */

import { describe, it, expect } from "vitest";
import { convertDocxToPdfPureNode } from "../../../_core/pdfFromDocxPureNode";
import { renderDerivarHojaDocx } from "../../../_core/docxRender";

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
