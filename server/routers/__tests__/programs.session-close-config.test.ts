/**
 * programs.session-close-config.test.ts — Schema tests for the
 * `session_close_config` JSONB shape on `programs`.
 *
 * Source of truth for the shape:
 *   Manus_IM/TASK6_EPIC_E_FAMILIA.md §10 (and earlier §8)
 *
 *   interface SessionCloseConfig {
 *     enabled: boolean;
 *     uploads: Array<{
 *       key: string;
 *       label: string;
 *       description?: string;
 *       required: boolean;
 *       ocr_type?: string;
 *     }>;
 *     fields: Array<{
 *       key: string;
 *       label: string;
 *       type: 'text' | 'textarea' | 'number' | 'date';
 *       required: boolean;
 *       default_value?: string | number;
 *     }>;
 *   }
 *
 * IMPORTANT: This is a TEST-ONLY contract lock. We do NOT add a migration
 * or alter the column here. We assert that IF a row has a non-null
 * `session_close_config`, the value parses against the expected Zod shape.
 *
 * The Zod schema below is co-located with the test (Manus_IM doc remains
 * the single source of truth) so that downstream code adopting this shape
 * has a reference contract to compare against.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";

// ─── Reference Zod shape (mirrors TASK6 §10) ─────────────────────────────────

const sessionCloseUploadSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean(),
  ocr_type: z.string().optional(),
});

const sessionCloseFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "textarea", "number", "date"]),
  required: z.boolean(),
  default_value: z.union([z.string(), z.number()]).optional(),
});

const sessionCloseConfigSchema = z.object({
  enabled: z.boolean(),
  uploads: z.array(sessionCloseUploadSchema),
  fields: z.array(sessionCloseFieldSchema),
});

// ─── Fixtures from TASK6 §10 ─────────────────────────────────────────────────

const FAMILIA_SESSION_CLOSE_CONFIG = {
  enabled: true,
  uploads: [
    {
      key: "albaran",
      label: "Fotografiar albarán BdeA",
      required: true,
      ocr_type: "delivery_albaran",
      description: "Documento con Nº lote, kg por categoría y código entidad",
    },
    {
      key: "hoja_firmas",
      label: "Fotografiar hoja de firmas",
      required: true,
      ocr_type: "delivery_sheet_collective",
      description: "Hoja colectiva con firmas de las familias que recogieron hoy",
    },
  ],
  fields: [],
};

const FORMACION_SESSION_CLOSE_CONFIG = {
  enabled: true,
  uploads: [],
  fields: [
    {
      key: "num_attendees",
      label: "Nº asistentes",
      type: "number",
      required: true,
    },
    {
      key: "observations",
      label: "Novedades / incidencias",
      type: "textarea",
      required: false,
    },
  ],
};

const DISABLED_DEFAULT = {
  enabled: false,
  uploads: [],
  fields: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("session_close_config — Familia preset (TASK6 §10)", () => {
  it("parses the Familia config (two required OCR uploads)", () => {
    const parsed = sessionCloseConfigSchema.safeParse(FAMILIA_SESSION_CLOSE_CONFIG);
    expect(parsed.success).toBe(true);
  });

  it("Familia config contains exactly 2 required uploads", () => {
    const parsed = sessionCloseConfigSchema.parse(FAMILIA_SESSION_CLOSE_CONFIG);
    expect(parsed.uploads).toHaveLength(2);
    expect(parsed.uploads.every(u => u.required)).toBe(true);
  });

  it("Familia upload keys match BR-D6 spec ('albaran' + 'hoja_firmas')", () => {
    const parsed = sessionCloseConfigSchema.parse(FAMILIA_SESSION_CLOSE_CONFIG);
    const keys = parsed.uploads.map(u => u.key);
    expect(keys).toContain("albaran");
    expect(keys).toContain("hoja_firmas");
  });
});

describe("session_close_config — Formación preset (TASK6 §10)", () => {
  it("parses the Formación config (fields-only, no uploads)", () => {
    const parsed = sessionCloseConfigSchema.safeParse(FORMACION_SESSION_CLOSE_CONFIG);
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown field type (must be text|textarea|number|date)", () => {
    const bad = {
      ...FORMACION_SESSION_CLOSE_CONFIG,
      fields: [
        {
          key: "broken",
          label: "Broken field",
          type: "checkbox",
          required: false,
        },
      ],
    };
    const parsed = sessionCloseConfigSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
  });
});

describe("session_close_config — disabled default", () => {
  it("parses the disabled default ({enabled:false, uploads:[], fields:[]})", () => {
    const parsed = sessionCloseConfigSchema.safeParse(DISABLED_DEFAULT);
    expect(parsed.success).toBe(true);
  });

  it("rejects null (column null is not the same as a stored config object)", () => {
    const parsed = sessionCloseConfigSchema.safeParse(null);
    expect(parsed.success).toBe(false);
  });

  it("rejects missing 'enabled' boolean", () => {
    const parsed = sessionCloseConfigSchema.safeParse({
      uploads: [],
      fields: [],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("session_close_config — row-shape contract (test-only)", () => {
  /**
   * Documents the contract: IF a programs row has a non-null
   * `session_close_config`, it MUST match the schema. NULL is allowed
   * at the column level (database default) and is handled by callers
   * before parsing.
   */
  it("upload entry requires key, label, and required flag", () => {
    const bad = {
      enabled: true,
      uploads: [{ label: "missing key", required: true }],
      fields: [],
    };
    expect(sessionCloseConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("field entry requires type to be in the allowed enum", () => {
    const bad = {
      enabled: true,
      uploads: [],
      fields: [
        { key: "x", label: "X", type: "email", required: false },
      ],
    };
    expect(sessionCloseConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("default_value accepts string OR number, but not boolean", () => {
    const okString = sessionCloseConfigSchema.safeParse({
      enabled: true,
      uploads: [],
      fields: [
        { key: "x", label: "X", type: "text", required: false, default_value: "hi" },
      ],
    });
    const okNumber = sessionCloseConfigSchema.safeParse({
      enabled: true,
      uploads: [],
      fields: [
        { key: "x", label: "X", type: "number", required: false, default_value: 42 },
      ],
    });
    const badBool = sessionCloseConfigSchema.safeParse({
      enabled: true,
      uploads: [],
      fields: [
        { key: "x", label: "X", type: "text", required: false, default_value: true },
      ],
    });
    expect(okString.success).toBe(true);
    expect(okNumber.success).toBe(true);
    expect(badBool.success).toBe(false);
  });
});
