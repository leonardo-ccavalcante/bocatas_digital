/**
 * Golden test for the INFORME VALORACIÓN SOCIAL FAMILIA template — the keystone
 * correctness proof, exercised through the REAL renderDocument() path (template
 * fetch + validateContext + dotted parser + docxtemplater), not raw docxtemplater.
 *
 * Asserts:
 *   (a) every scalar «field» is filled from the correct context path — unique
 *       sentinels, no silent blanks (this is what the determinism test cannot see);
 *   (b) the member section is a true loop: exactly N rows for N members, for
 *       0/1/6/12 — proving the fixed 2–10 slot overflow is gone;
 *   (c) no template tag is left unrendered.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PizZip from "pizzip";

import type { FamilyDocumentContext } from "../documentService.types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, "../__fixtures__/informe-valoracion-social.docx");
const fixtureBuffer = fs.readFileSync(FIXTURE);

const MOCK_TEMPLATE_ROW = {
  id: "tmpl-informe-golden",
  slug: "informe_social",
  mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  storage_path: "templates/informe-valoracion-social.docx",
  logos: [],
  static_blocks: {},
  // Only always-present, legally-required scalars are declared (optional fields
  // like titular.pais/direccion blank via nullGetter instead of failing).
  placeholders: [
    "titular.nombre",
    "titular.apellidos",
    "titular.documento",
    "familia.numero",
    "valoracion",
  ],
};

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "document_templates") {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: MOCK_TEMPLATE_ROW, error: null }) }) }),
          }),
        };
      }
      if (table === "document_render_log") return { insert: () => Promise.resolve({ error: null }) };
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

vi.mock("../../storage", () => ({ fetchStorageBuffer: vi.fn() }));

import { renderDocument } from "../documentService";
import * as storageModule from "../../storage";

const RECENT = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);

function context(nMembers: number): FamilyDocumentContext {
  return {
    titular: {
      nombre: "TITNOMBRE",
      apellidos: "TITAPELLIDOS",
      documento: "TITDNI",
      telefono: "TITTEL",
      pais: "TITPAIS",
      fecha_nacimiento: "1980-01-02",
      direccion: "TITDIR",
    },
    familia: {
      numero: "0042",
      num_adultos: 1,
      num_menores_18: nMembers,
      total_miembros: nMembers + 1,
      distrito: "Centro",
      codigo_postal: "28001",
      estado: "activa",
      fecha_alta: "2026-01-15",
    },
    miembros: Array.from({ length: nMembers }, (_, i) => ({
      numero: i + 2,
      nombre: `M${i}NOMBRE`,
      apellidos: `M${i}APE`,
      parentesco: `PAR${i}`,
      fecha_nacimiento: `200${i % 10}-01-01`,
      documento: `DOC${i}`,
    })),
    informe: {
      fecha_seguimiento: RECENT,
      notas_seguimiento: "seg",
      effective_date: RECENT,
      has_informe_previo: true,
    },
    valoracion: "NARRATIVA_SENTINEL",
    logos: [],
    static_blocks: {},
    generated_at: "2026-07-07T00:00:00.000Z",
    generated_by_name: "",
  };
}

async function renderXml(ctx: FamilyDocumentContext): Promise<string> {
  const { buffer } = await renderDocument("informe_social", ctx, {
    actorId: "actor-golden",
    familyId: "family-golden",
  });
  return new PizZip(buffer).files["word/document.xml"].asText();
}

describe("informe valoración social template (via renderDocument)", () => {
  beforeEach(() => {
    vi.mocked(storageModule.fetchStorageBuffer).mockResolvedValue(fixtureBuffer);
  });

  it("fills every scalar field from the correct context path", async () => {
    const xml = await renderXml(context(3));
    for (const sentinel of [
      "TITNOMBRE",
      "TITAPELLIDOS",
      "TITDNI",
      "TITTEL",
      "TITPAIS",
      "1980-01-02",
      "TITDIR",
      "0042",
      "2026-01-15",
      "NARRATIVA_SENTINEL",
    ]) {
      expect(xml).toContain(sentinel);
    }
  });

  it("leaves NO unrendered template tags (every field consumed)", async () => {
    const xml = await renderXml(context(2));
    expect(xml).not.toMatch(
      /\{[#/]?(titular|familia|valoracion|miembros|nombre|apellidos|numero|documento|parentesco|fecha_nacimiento)\b/,
    );
  });

  it.each([0, 1, 6, 12])("renders exactly %i member rows (loop, no fixed-slot overflow)", async (n) => {
    const xml = await renderXml(context(n));
    const rows = (xml.match(/PAR\d+/g) ?? []).length;
    expect(rows).toBe(n);
    for (let i = 0; i < n; i++) expect(xml).toContain(`M${i}NOMBRE`);
  });
});
