/**
 * pdfInfoRows.layout.test.ts
 *
 * TDD test for Bug 2: "Programa de referencia" text wraps to a second line
 * in the generated PDF, overlapping with "Profesional de referencia".
 *
 * Root cause: pdfkit's `continued: true` + `width: LABEL_W` pattern does not
 * guarantee the value stays on the same line when the label text is close to
 * LABEL_W. The fix is to position the value using an explicit x coordinate
 * instead of relying on `continued: true`.
 *
 * Contract:
 *   - renderDerivarHojaPdf must produce a PDF Buffer (starts with %PDF)
 *   - The PDF must NOT throw even with long programaReferencia values
 *   - The function must complete without errors for all info row combinations
 *
 * Note: We cannot easily parse PDF text positions in unit tests, so we verify
 * the contract via:
 *   1. No throw for long label values
 *   2. PDF size is reasonable (layout didn't crash)
 *   3. The function handles all edge cases (empty values, long values, unicode)
 */

import { describe, it, expect } from "vitest";
import { renderDerivarHojaPdf } from "../pdfFromDocxPureNode";
import type { DerivarHojaTemplateData } from "../docxRender";

const baseData: DerivarHojaTemplateData = {
  nombre: "Juan García López",
  numUnidadFamiliar: "2422",
  programaReferencia: "Programa Familias",
  profesionalReferencia: "Leo Cavalcante",
  fechaApertura: "09/06/2026",
  intervenciones: [],
};

describe("renderDerivarHojaPdf — info rows layout (Bug 2)", () => {
  it("does not throw for a typical programaReferencia value", async () => {
    await expect(renderDerivarHojaPdf(baseData)).resolves.toBeDefined();
  });

  it("does not throw for a long programaReferencia value that would overflow LABEL_W", async () => {
    const data: DerivarHojaTemplateData = {
      ...baseData,
      programaReferencia: "Programa de Intervención Familiar y Seguimiento Social Integral",
    };
    const pdf = await renderDerivarHojaPdf(data);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.slice(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it("does not throw for a long profesionalReferencia value", async () => {
    const data: DerivarHojaTemplateData = {
      ...baseData,
      profesionalReferencia: "María Fernández González de la Torre",
    };
    const pdf = await renderDerivarHojaPdf(data);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.slice(0, 4).toString()).toBe("%PDF");
  });

  it("does not throw for empty info fields", async () => {
    const data: DerivarHojaTemplateData = {
      ...baseData,
      numUnidadFamiliar: "",
      programaReferencia: "",
      profesionalReferencia: "",
    };
    await expect(renderDerivarHojaPdf(data)).resolves.toBeDefined();
  });

  it("produces consistent PDF size for same input (deterministic layout)", async () => {
    const pdf1 = await renderDerivarHojaPdf(baseData);
    const pdf2 = await renderDerivarHojaPdf(baseData);
    // Both should be valid PDFs of similar size (within 5% — pdfkit is deterministic)
    expect(Math.abs(pdf1.length - pdf2.length)).toBeLessThan(pdf1.length * 0.05);
  });
});
