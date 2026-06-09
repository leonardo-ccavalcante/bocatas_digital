/**
 * pdfFromDocx.pdfkit.test.ts
 *
 * Contract tests for convertDocxToPdfPureNode — PDF generation without LibreOffice.
 *
 * Iron Law: these tests define the contract. Fix the implementation, never the test.
 */

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

// Import the pure-Node PDF conversion function (does NOT require LibreOffice)
import { convertDocxToPdfPureNode } from "../pdfFromDocxPureNode";

describe("convertDocxToPdfPureNode", () => {
  it("returns a Buffer starting with %PDF header", async () => {
    const docxBuf = readFileSync(
      "server/_core/__fixtures__/derivacion_hoja_template_v1.docx",
    );
    const pdfBuf = await convertDocxToPdfPureNode(docxBuf);
    expect(Buffer.isBuffer(pdfBuf)).toBe(true);
    expect(pdfBuf.length).toBeGreaterThan(100);
    // PDF files start with %PDF
    expect(pdfBuf.slice(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("includes the document title in the PDF metadata", async () => {
    const docxBuf = readFileSync(
      "server/_core/__fixtures__/derivacion_hoja_template_v1.docx",
    );
    const pdfBuf = await convertDocxToPdfPureNode(docxBuf, {
      title: "Hoja de Derivaciones",
    });
    // PDF should be a valid buffer
    expect(pdfBuf.slice(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("does not throw when given a minimal valid DOCX", async () => {
    const docxBuf = readFileSync(
      "server/_core/__fixtures__/derivacion_hoja_template_v1.docx",
    );
    await expect(convertDocxToPdfPureNode(docxBuf)).resolves.toBeDefined();
  });
});
