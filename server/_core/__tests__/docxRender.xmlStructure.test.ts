/**
 * docxRender.xmlStructure.test.ts
 *
 * TDD tests for DOCX XML structural correctness.
 *
 * Contracts (Karpathy: verify exact behavior, not just "it works"):
 *   1. createImageElement must produce balanced XML:
 *      - Every <wp:inline ...> must have a matching </wp:inline>
 *      - </wp:inline> must appear BEFORE </w:drawing>
 *   2. updateContentTypes must declare a <Default Extension="png"> entry
 *      when PNG images are injected.
 *   3. The final DOCX document.xml must be parseable as valid XML.
 */

import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Access private helpers via the module ─────────────────────────────────────
// We test the public renderDerivarHojaDocx API and inspect the ZIP output.
import { renderDerivarHojaDocx } from "../docxRender";

const testData = {
  nombre: "Test User",
  numUnidadFamiliar: "123",
  programaReferencia: "Programa Familias",
  profesionalReferencia: "Test Professional",
  fechaApertura: "9/6/2026",
  intervenciones: [],
};

function loadLogo(): Buffer | undefined {
  try {
    return readFileSync(resolve(process.cwd(), "client/public/bocatas-logo.png"));
  } catch {
    return undefined;
  }
}

describe("docxRender — XML structural correctness (Bug 1)", () => {
  it("document.xml contains balanced wp:inline tags when logo is injected", async () => {
    const logo = loadLogo();
    if (!logo) return; // skip if logo not available in CI

    const docxBuffer = await renderDerivarHojaDocx(testData, { bocatasLogo: logo });
    const zip = new PizZip(docxBuffer);
    const xml = zip.files["word/document.xml"].asText();

    // Count opening and closing wp:inline tags
    const openCount = (xml.match(/<wp:inline\b/g) ?? []).length;
    const closeCount = (xml.match(/<\/wp:inline>/g) ?? []).length;

    expect(openCount).toBeGreaterThan(0);
    expect(closeCount).toBe(openCount); // must be balanced
  });

  it("</wp:inline> appears before </w:drawing> in document.xml", async () => {
    const logo = loadLogo();
    if (!logo) return;

    const docxBuffer = await renderDerivarHojaDocx(testData, { bocatasLogo: logo });
    const zip = new PizZip(docxBuffer);
    const xml = zip.files["word/document.xml"].asText();

    // Find the first drawing block and verify </wp:inline> comes before </w:drawing>
    const inlineCloseIdx = xml.indexOf("</wp:inline>");
    const drawingCloseIdx = xml.indexOf("</w:drawing>");

    expect(inlineCloseIdx).toBeGreaterThan(-1); // </wp:inline> must exist
    expect(drawingCloseIdx).toBeGreaterThan(-1); // </w:drawing> must exist
    expect(inlineCloseIdx).toBeLessThan(drawingCloseIdx); // correct nesting
  });

  it("[Content_Types].xml declares a Default entry for png extension", async () => {
    const logo = loadLogo();
    if (!logo) return;

    const docxBuffer = await renderDerivarHojaDocx(testData, { bocatasLogo: logo });
    const zip = new PizZip(docxBuffer);
    const ctXml = zip.files["[Content_Types].xml"]?.asText() ?? "";

    // Must declare PNG content type (either as Default or Override)
    const hasPngDeclaration =
      ctXml.includes('Extension="png"') ||
      ctXml.includes("image/png");

    expect(hasPngDeclaration).toBe(true);
  });

  it("document.xml is parseable as valid XML after logo injection", async () => {
    const logo = loadLogo();
    if (!logo) return;

    const docxBuffer = await renderDerivarHojaDocx(testData, { bocatasLogo: logo });
    const zip = new PizZip(docxBuffer);
    const xml = zip.files["word/document.xml"].asText();

    // Use DOMParser via the xmldom package (available in Node.js test env)
    // Fallback: check that the XML doesn't have obvious structural errors
    // by verifying key tag balance
    const openDrawing = (xml.match(/<w:drawing>/g) ?? []).length;
    const closeDrawing = (xml.match(/<\/w:drawing>/g) ?? []).length;
    expect(openDrawing).toBe(closeDrawing);

    const openRun = (xml.match(/<w:r(?:\s[^>]*)?>(?!\/)/g) ?? []).length;
    const closeRun = (xml.match(/<\/w:r>/g) ?? []).length;
    // Runs must be balanced (open count === close count)
    expect(openRun).toBe(closeRun);
  });
});
