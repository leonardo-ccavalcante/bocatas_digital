/**
 * Determinism test for renderDocument.
 *
 * Two consecutive renders with identical context and mocks must produce
 * byte-identical output buffers.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import type { FamilyDocumentContext } from "../documentService.types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FIXTURE_PATH = path.resolve(__dirname, "../__fixtures__/minimal-informe.docx");
const fixtureBuffer = fs.readFileSync(FIXTURE_PATH);

const MOCK_TEMPLATE_ROW = {
  id: "tmpl-uuid-det-001",
  slug: "informe_social",
  mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  storage_path: "templates/informe-social.docx",
  logos: [],
  static_blocks: {},
  placeholders: ["titular.nombre", "familia.numero"],
};

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "document_templates") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: MOCK_TEMPLATE_ROW, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "document_render_log") {
        return { insert: () => Promise.resolve({ error: null }) };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

vi.mock("../../storage", () => ({
  fetchStorageBuffer: vi.fn(),
}));

import { renderDocument } from "../documentService";
import * as storageModule from "../../storage";

const CONTEXT: FamilyDocumentContext = {
  titular: { nombre: "Juan", apellidos: "Pérez", documento: "Y2", telefono: "611" },
  familia: {
    numero: "0007",
    num_adultos: 1,
    num_menores_18: 0,
    total_miembros: 1,
    distrito: null,
    codigo_postal: null,
    estado: "activa",
  },
  miembros: [],
  informe: {
    fecha_seguimiento: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    notas_seguimiento: "OK.",
    effective_date: "",
  },
  logos: [],
  static_blocks: {},
  generated_at: "2026-05-21T00:00:00.000Z",
  generated_by_name: "Voluntario",
};

describe("renderDocument determinism", () => {
  beforeEach(() => {
    vi.mocked(storageModule.fetchStorageBuffer).mockResolvedValue(fixtureBuffer);
  });

  it("produces byte-identical output for two renders with the same context", async () => {
    const opts = { actorId: "actor-uuid-det-002", familyId: "family-uuid-det-002" };

    const r1 = await renderDocument("informe_social", CONTEXT, opts);
    const r2 = await renderDocument("informe_social", CONTEXT, opts);

    expect(Buffer.isBuffer(r1.buffer)).toBe(true);
    expect(Buffer.isBuffer(r2.buffer)).toBe(true);
    expect(Buffer.compare(r1.buffer, r2.buffer)).toBe(0);
  });
});
