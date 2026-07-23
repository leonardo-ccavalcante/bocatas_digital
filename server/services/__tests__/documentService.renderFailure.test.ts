/**
 * PII-safety test for the renderDocument render-failure path.
 *
 * docxtemplater render errors can embed rendered VALUES (which, in E1, are
 * beneficiary PII: documento, teléfono, nombre). renderDocument must NOT forward
 * that raw message to the client — it must throw a fixed, PII-free Spanish
 * message.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import type { FamilyDocumentContext } from "../documentService.types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, "../__fixtures__/minimal-informe.docx");

// A fake beneficiary document number that the docxtemplater error will embed.
const PII = "X1234567A";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) =>
      table === "document_templates"
        ? {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: () =>
                    Promise.resolve({
                      data: {
                        id: "tmpl-1",
                        slug: "informe_social",
                        mime: DOCX_MIME,
                        storage_path: "templates/informe-social.docx",
                        logos: [],
                        static_blocks: {},
                        placeholders: ["titular.nombre", "familia.numero"],
                      },
                      error: null,
                    }),
                }),
              }),
            }),
          }
        : { insert: () => Promise.resolve({ error: null }) },
  }),
}));

vi.mock("../../storage", () => ({
  fetchStorageBuffer: vi.fn(),
}));

// Force docxtemplater render() to throw a message embedding PII.
vi.mock("docxtemplater", () => ({
  default: vi.fn().mockImplementation(() => ({
    render: () => {
      throw new Error(`Scope error: valor ${PII} inválido para la familia`);
    },
    getZip: () => ({ generate: () => Buffer.from("unused") }),
  })),
}));

import { renderDocument, DocumentValidationError } from "../documentService";
import * as storageModule from "../../storage";

const fixtureBuffer = fs.readFileSync(FIXTURE_PATH);

const CONTEXT: FamilyDocumentContext = {
  titular: { nombre: "María", apellidos: "García", documento: PII, telefono: "600000000" },
  familia: {
    numero: "0042",
    num_adultos: 2,
    num_menores_18: 1,
    total_miembros: 3,
    distrito: null,
    codigo_postal: null,
    estado: "activa",
  },
  miembros: [],
  informe: {
    fecha_seguimiento: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10),
    notas_seguimiento: "OK.",
    effective_date: "",
    has_informe_previo: true,
  },
  logos: [],
  static_blocks: {},
  generated_at: new Date().toISOString(),
  generated_by_name: "Voluntario",
};

describe("renderDocument render-failure PII safety", () => {
  beforeEach(() => {
    vi.mocked(storageModule.fetchStorageBuffer).mockResolvedValue(fixtureBuffer);
  });

  it("throws RENDER_FAILED without forwarding the raw docxtemplater message (no PII)", async () => {
    let caught: unknown;
    try {
      await renderDocument("informe_social", CONTEXT, { actorId: "1", familyId: "fam-uuid-1" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(DocumentValidationError);
    const err = caught as DocumentValidationError;
    expect(err.code).toBe("RENDER_FAILED");
    expect(err.message).not.toContain(PII);
    expect(err.message).toBe("Error al generar el documento. Revisa los datos de la familia.");
  });
});
