/**
 * docxRender.logos.test.ts
 *
 * TDD tests for logo injection in DOCX rendering.
 * Verifies that Bocatas logo is properly injected into the generated DOCX.
 */

import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import PizZip from "pizzip";

import { renderDerivarHojaDocx } from "../docxRender";

// DIO-04: exercise REAL docx rendering against the committed template fixture,
// not a live Supabase. Without this the template "download" hits http://localhost
// and hangs until the 5s test timeout in CI (no DB) — a false-red integration
// dependency in what is really a rendering unit test.
vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(async () => {
          const { readFileSync: rf } = await import("node:fs");
          const { resolve } = await import("node:path");
          const buf = rf(
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

describe("renderDerivarHojaDocx — logo injection", () => {
  it("injects Bocatas logo when provided", async () => {
    const logoBuffer = readFileSync(
      "client/public/bocatas-logo.png",
    );
    const docxBuffer = await renderDerivarHojaDocx(testData, {
      bocatasLogo: logoBuffer,
    });

    // Verify it's a valid DOCX (ZIP archive)
    expect(Buffer.isBuffer(docxBuffer)).toBe(true);

    // Extract and check for image content
    const zip = new PizZip(docxBuffer);
    const xml = zip.files["word/document.xml"].asText();

    // Should contain image references (blip elements)
    expect(xml).toContain("blip");
    expect(xml).toContain("image");
  });

  it("generates valid DOCX without logo (graceful fallback)", async () => {
    const docxBuffer = await renderDerivarHojaDocx(testData);

    // Should still generate a valid DOCX
    expect(Buffer.isBuffer(docxBuffer)).toBe(true);
    expect(docxBuffer.length).toBeGreaterThan(1000);

    // Should be a valid ZIP
    const zip = new PizZip(docxBuffer);
    expect(zip.files["word/document.xml"]).toBeDefined();
  });

  it("does NOT produce nested <w:r><w:r> XML corruption when injecting logo", async () => {
    const logoBuffer = readFileSync(
      "client/public/bocatas-logo.png",
    );
    const docxBuffer = await renderDerivarHojaDocx(testData, {
      bocatasLogo: logoBuffer,
    });

    const zip = new PizZip(docxBuffer);
    const xml = zip.files["word/document.xml"].asText();

    // Must NOT contain nested <w:r><w:r> — this is the corruption bug
    // (<w:r> inside <w:r> is invalid OOXML; <w:r><w:rPr> is valid and expected)
    expect(xml).not.toContain("<w:r><w:r>");
  });

  it("preserves template content when injecting logos", async () => {
    const logoBuffer = readFileSync(
      "client/public/bocatas-logo.png",
    );
    const docxBuffer = await renderDerivarHojaDocx(testData, {
      bocatasLogo: logoBuffer,
    });

    const zip = new PizZip(docxBuffer);
    const xml = zip.files["word/document.xml"].asText();

    // Verify template data is still present
    expect(xml).toContain("Test User");
    expect(xml).toContain("Test Program");
    expect(xml).toContain("9/6/2026");
  });
});
