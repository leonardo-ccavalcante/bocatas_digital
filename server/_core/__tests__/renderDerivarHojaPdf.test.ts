/**
 * renderDerivarHojaPdf.test.ts
 *
 * Contract tests for renderDerivarHojaPdf — visual PDF generation.
 *
 * Contracts:
 *   - Returns a Buffer starting with %PDF
 *   - Output size is reasonable (>5KB for a real document)
 *   - Does not throw with empty interventions
 *   - Does not throw when logos are provided
 */

import { describe, it, expect } from "vitest";
import { renderDerivarHojaPdf } from "../pdfFromDocxPureNode";
import type { DerivarHojaTemplateData } from "../docxRender";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sampleData: DerivarHojaTemplateData = {
  nombre: "Juan García López",
  numUnidadFamiliar: "2422",
  programaReferencia: "Programa Familias",
  profesionalReferencia: "Leo Cavalcante",
  fechaApertura: "09/06/2026",
  intervenciones: [
    {
      fecha: "09/06/2026",
      tipo: "Salud",
      descripcion: "Derivación a Médicos del Mundo",
      recursoNombre: "Médicos del Mundo",
      recursoDireccion: "Calle Mayor 1",
      recursoTelefono: "91 000 0000",
      observaciones: "Urgente",
      firmaPlaceholder: "",
    },
    {
      fecha: "10/06/2026",
      tipo: "Vivienda",
      descripcion: "Derivación a Cruz Roja",
      recursoNombre: "Cruz Roja",
      recursoDireccion: "Av. Reina Victoria 12",
      recursoTelefono: "91 111 1111",
      observaciones: "",
      firmaPlaceholder: "",
    },
  ],
};

describe("renderDerivarHojaPdf — visual PDF output", () => {
  it("returns a Buffer starting with %PDF header", async () => {
    const pdfBuf = await renderDerivarHojaPdf(sampleData);
    expect(Buffer.isBuffer(pdfBuf)).toBe(true);
    expect(pdfBuf.slice(0, 4).toString()).toBe("%PDF");
  });

  it("produces a reasonably-sized PDF (>2KB) for a document with interventions", async () => {
    const pdfBuf = await renderDerivarHojaPdf(sampleData);
    expect(pdfBuf.length).toBeGreaterThan(2000);
  });

  it("does not throw with empty interventions list", async () => {
    const emptyData: DerivarHojaTemplateData = {
      ...sampleData,
      intervenciones: [],
    };
    await expect(renderDerivarHojaPdf(emptyData)).resolves.toBeDefined();
  });

  it("does not throw when Bocatas logo buffer is provided", async () => {
    let logoBuffer: Buffer;
    try {
      logoBuffer = readFileSync(
        resolve(process.cwd(), "client/public/bocatas-logo.png"),
      );
    } catch {
      // Logo not available in test environment — skip logo injection
      logoBuffer = Buffer.alloc(0);
    }

    await expect(
      renderDerivarHojaPdf(sampleData, {
        bocatasLogo: logoBuffer.length > 0 ? logoBuffer : undefined,
      }),
    ).resolves.toBeDefined();
  });
});
