import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import type { FamilyDocumentContext } from "../documentService.types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Fixture ──────────────────────────────────────────────────────────────────

const FIXTURE_PATH = path.resolve(__dirname, "../__fixtures__/minimal-informe.docx");
const fixtureBuffer = fs.readFileSync(FIXTURE_PATH);

// ── Mock createAdminClient (hoisted) ─────────────────────────────────────────

const mockTemplateRow = {
  id: "tmpl-uuid-001",
  slug: "informe_social",
  mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  storage_path: "templates/informe-social.docx",
  logos: [],
  static_blocks: {},
  placeholders: ["titular.nombre", "familia.numero"],
};

// Controls what the DB mock returns for document_templates queries.
let dbTemplateResult: { data: typeof mockTemplateRow | null; error: { message: string } | null } =
  { data: mockTemplateRow, error: null };

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "document_templates") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve(dbTemplateResult),
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

// ── Import after mocks are set up ────────────────────────────────────────────

import { DocumentValidationError, validateContext, renderDocument } from "../documentService";
import * as storageModule from "../../storage";

// ── Shared contexts ──────────────────────────────────────────────────────────

// Mirrors the published placeholder list (scripts/publish-informe-template.mjs) —
// the live template declares NO informe.* placeholder; the seguimiento rule is the
// hardcoded slug gate, not the generic loop.
const MINIMAL_TEMPLATE = {
  id: "t1",
  slug: "informe_social" as const,
  placeholders: ["titular.nombre", "titular.apellidos", "titular.documento", "familia.numero", "valoracion"],
  static_blocks: {},
};

const VALID_CONTEXT: FamilyDocumentContext = {
  titular: { nombre: "María", apellidos: "García", documento: "X1", telefono: "600" },
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
  valoracion: "La unidad familiar está compuesta por 3 personas.",
  informe: {
    fecha_seguimiento: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    notas_seguimiento: "Bien.",
    effective_date: "",
    has_informe_previo: true,
  },
  logos: [],
  static_blocks: {},
  generated_at: new Date().toISOString(),
  generated_by_name: "Voluntario",
};

// ── validateContext tests ────────────────────────────────────────────────────

describe("validateContext", () => {
  it("passes for valid informe_social context", () => {
    expect(() => validateContext(MINIMAL_TEMPLATE, VALID_CONTEXT)).not.toThrow();
  });

  it("throws MISSING_PLACEHOLDER when titular.nombre is empty string", () => {
    const ctx = { ...VALID_CONTEXT, titular: { ...VALID_CONTEXT.titular, nombre: "" } };
    expect(() => validateContext(MINIMAL_TEMPLATE, ctx)).toThrowError(DocumentValidationError);
    try {
      validateContext(MINIMAL_TEMPLATE, ctx);
    } catch (e) {
      expect((e as DocumentValidationError).code).toBe("MISSING_PLACEHOLDER");
      expect((e as DocumentValidationError).details).toHaveProperty("missing");
    }
  });

  it("renovación: throws STALE_INFORME when fecha_seguimiento is stale", () => {
    const staleDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const ctx: FamilyDocumentContext = {
      ...VALID_CONTEXT,
      informe: { ...VALID_CONTEXT.informe!, fecha_seguimiento: staleDate, effective_date: staleDate },
    };
    expect(() => validateContext(MINIMAL_TEMPLATE, ctx)).toThrowError(DocumentValidationError);
    try {
      validateContext(MINIMAL_TEMPLATE, ctx);
    } catch (e) {
      expect((e as DocumentValidationError).code).toBe("STALE_INFORME");
    }
  });

  it("renovación: throws MISSING_PLACEHOLDER when fecha_seguimiento is empty", () => {
    const ctx: FamilyDocumentContext = {
      ...VALID_CONTEXT,
      informe: { ...VALID_CONTEXT.informe!, fecha_seguimiento: "", effective_date: "" },
    };
    expect(() => validateContext(MINIMAL_TEMPLATE, ctx)).toThrowError(DocumentValidationError);
    try {
      validateContext(MINIMAL_TEMPLATE, ctx);
    } catch (e) {
      expect((e as DocumentValidationError).code).toBe("MISSING_PLACEHOLDER");
      expect((e as DocumentValidationError).details.missing).toEqual(["informe.fecha_seguimiento"]);
    }
  });

  it("throws MISSING_PLACEHOLDER when the informe block is missing entirely", () => {
    const ctx = { ...VALID_CONTEXT, informe: undefined };
    expect(() => validateContext(MINIMAL_TEMPLATE, ctx as never)).toThrowError(
      DocumentValidationError
    );
    try {
      validateContext(MINIMAL_TEMPLATE, ctx as never);
    } catch (e) {
      expect((e as DocumentValidationError).code).toBe("MISSING_PLACEHOLDER");
      expect((e as DocumentValidationError).details.missing).toEqual(["informe"]);
    }
  });

  it("first informe: passes with zero seguimientos (empty fecha_seguimiento)", () => {
    const ctx: FamilyDocumentContext = {
      ...VALID_CONTEXT,
      informe: {
        fecha_seguimiento: "",
        notas_seguimiento: "",
        effective_date: "",
        has_informe_previo: false,
      },
    };
    expect(() => validateContext(MINIMAL_TEMPLATE, ctx)).not.toThrow();
  });

  it("first informe: passes even with a stale seguimiento on record", () => {
    const staleDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const ctx: FamilyDocumentContext = {
      ...VALID_CONTEXT,
      informe: {
        fecha_seguimiento: staleDate,
        notas_seguimiento: "Antiguo.",
        effective_date: staleDate,
        has_informe_previo: false,
      },
    };
    expect(() => validateContext(MINIMAL_TEMPLATE, ctx)).not.toThrow();
  });
});

// ── renderDocument tests ─────────────────────────────────────────────────────

describe("renderDocument", () => {
  beforeEach(() => {
    dbTemplateResult = { data: mockTemplateRow, error: null };
    vi.mocked(storageModule.fetchStorageBuffer).mockResolvedValue(fixtureBuffer);
  });

  it("returns a non-empty Buffer, correct mime, and correct fileName pattern", async () => {
    const result = await renderDocument("informe_social", VALID_CONTEXT, {
      actorId: "actor-uuid-001",
      familyId: "family-uuid-001",
    });

    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.mime).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(result.fileName).toMatch(/^informe-social-F0042-\d{4}-\d{2}-\d{2}\.docx$/);
  });

  it("throws TEMPLATE_NOT_FOUND when no active template exists", async () => {
    dbTemplateResult = { data: null, error: { message: "not found" } };

    await expect(
      renderDocument("informe_social", VALID_CONTEXT, {
        actorId: "actor-uuid-001",
        familyId: "family-uuid-001",
      })
    ).rejects.toMatchObject({ code: "TEMPLATE_NOT_FOUND" });
  });

  it("throws RENDER_FAILED when storage download fails", async () => {
    vi.mocked(storageModule.fetchStorageBuffer).mockRejectedValue(
      new Error("Storage unavailable")
    );

    await expect(
      renderDocument("informe_social", VALID_CONTEXT, {
        actorId: "actor-uuid-001",
        familyId: "family-uuid-001",
      })
    ).rejects.toMatchObject({ code: "RENDER_FAILED" });
  });
});
