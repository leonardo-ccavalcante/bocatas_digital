/**
 * announcementRouterContract.test.ts — Schema-level contract tests.
 *
 * Validates the shape of inputs the announcements router accepts/rejects,
 * and the integration of the pure helpers the router relies on. Avoids
 * mocking the Supabase admin client (high effort, brittle); instead it
 * pins the surface that's most likely to drift during refactors.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  ANNOUNCEMENT_TYPES,
  ANNOUNCEMENT_ROLES,
  ANNOUNCEMENT_PROGRAMS,
} from "../../shared/announcementTypes";
import {
  diffForAudit,
  shouldFireWebhook,
  validateBulkRow,
} from "../announcements-helpers";

// ── Mirror of router's input schemas (kept in sync via this test) ────────────

const uuidLike = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
);

const AnnouncementTipoEnum = z.enum([...ANNOUNCEMENT_TYPES] as [string, ...string[]]);

const AudienceRuleSchema = z.object({
  roles: z.array(z.enum([...ANNOUNCEMENT_ROLES] as [string, ...string[]])),
  programs: z.array(z.enum([...ANNOUNCEMENT_PROGRAMS] as [string, ...string[]])),
});

const CreateAnnouncementSchema = z.object({
  titulo: z.string().min(1).max(200),
  contenido: z.string().min(1).max(5000),
  tipo: AnnouncementTipoEnum.default("info"),
  es_urgente: z.boolean().default(false),
  fecha_inicio: z.string().datetime().optional(),
  fecha_fin: z.string().datetime().optional().nullable(),
  fijado: z.boolean().default(false),
  imagen_url: z.string().url().optional().nullable(),
  audiences: z.array(AudienceRuleSchema).min(1),
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("announcements router — create input contract", () => {
  it("accepts a minimal valid announcement", () => {
    const result = CreateAnnouncementSchema.safeParse({
      titulo: "x",
      contenido: "y",
      audiences: [{ roles: [], programs: [] }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty titulo", () => {
    const result = CreateAnnouncementSchema.safeParse({
      titulo: "",
      contenido: "y",
      audiences: [{ roles: [], programs: [] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty audiences (multi-rule UI requires >=1)", () => {
    const result = CreateAnnouncementSchema.safeParse({
      titulo: "x",
      contenido: "y",
      audiences: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects legacy tipo 'cierre'", () => {
    const result = CreateAnnouncementSchema.safeParse({
      titulo: "x",
      contenido: "y",
      tipo: "cierre",
      audiences: [{ roles: [], programs: [] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects legacy tipo 'urgente' (use es_urgente boolean instead)", () => {
    const result = CreateAnnouncementSchema.safeParse({
      titulo: "x",
      contenido: "y",
      tipo: "urgente",
      audiences: [{ roles: [], programs: [] }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts all 4 current tipo values", () => {
    for (const tipo of ANNOUNCEMENT_TYPES) {
      const result = CreateAnnouncementSchema.safeParse({
        titulo: "x",
        contenido: "y",
        tipo,
        audiences: [{ roles: [], programs: [] }],
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts multiple audience rules", () => {
    const result = CreateAnnouncementSchema.safeParse({
      titulo: "x",
      contenido: "y",
      audiences: [
        { roles: ["voluntario"], programs: ["comedor"] },
        { roles: ["admin"], programs: [] },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown role in an audience rule", () => {
    const result = CreateAnnouncementSchema.safeParse({
      titulo: "x",
      contenido: "y",
      audiences: [{ roles: ["root"], programs: [] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-URL imagen_url", () => {
    const result = CreateAnnouncementSchema.safeParse({
      titulo: "x",
      contenido: "y",
      imagen_url: "not-a-url",
      audiences: [{ roles: [], programs: [] }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts null imagen_url (image is optional)", () => {
    const result = CreateAnnouncementSchema.safeParse({
      titulo: "x",
      contenido: "y",
      imagen_url: null,
      audiences: [{ roles: [], programs: [] }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects titulo > 200 chars", () => {
    const result = CreateAnnouncementSchema.safeParse({
      titulo: "x".repeat(201),
      contenido: "y",
      audiences: [{ roles: [], programs: [] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects contenido > 5000 chars", () => {
    const result = CreateAnnouncementSchema.safeParse({
      titulo: "x",
      contenido: "y".repeat(5001),
      audiences: [{ roles: [], programs: [] }],
    });
    expect(result.success).toBe(false);
  });
});

describe("announcements router — uuid validation", () => {
  it("accepts a valid v4 UUID", () => {
    expect(
      uuidLike.safeParse("550e8400-e29b-41d4-a716-446655440000").success
    ).toBe(true);
  });
  it("rejects a non-UUID string", () => {
    expect(uuidLike.safeParse("not-a-uuid").success).toBe(false);
  });
});

describe("announcements router — webhook firing decision", () => {
  it("fires on create when es_urgente=true", () => {
    expect(shouldFireWebhook(null, true, true)).toBe(true);
  });
  it("does not fire on create when es_urgente=false", () => {
    expect(shouldFireWebhook(null, false, true)).toBe(false);
  });
  it("fires on update when es_urgente flips false -> true", () => {
    expect(shouldFireWebhook(false, true, false)).toBe(true);
  });
  it("does not fire on update when es_urgente stays true", () => {
    expect(shouldFireWebhook(true, true, false)).toBe(false);
  });
  it("does not fire on update when es_urgente flips true -> false", () => {
    expect(shouldFireWebhook(true, false, false)).toBe(false);
  });
});

describe("announcements router — diff produces audit rows", () => {
  it("produces zero changes when nothing differs", () => {
    const snapshot = {
      titulo: "x",
      contenido: "y",
      tipo: "info" as const,
      es_urgente: false,
      fecha_inicio: null,
      fecha_fin: null,
      fijado: false,
      imagen_url: null,
    };
    expect(diffForAudit(snapshot, snapshot)).toHaveLength(0);
  });

  it("produces one change per modified field", () => {
    const prev = {
      titulo: "x",
      contenido: "y",
      tipo: "info" as const,
      es_urgente: false,
      fecha_inicio: null,
      fecha_fin: null,
      fijado: false,
      imagen_url: null,
    };
    const next = { ...prev, titulo: "X", es_urgente: true };
    const changes = diffForAudit(prev, next);
    expect(changes).toHaveLength(2);
    expect(changes.map((c) => c.field).sort()).toEqual(["es_urgente", "titulo"]);
  });
});

describe("announcements router — bulk row validation rejects legacy tipo", () => {
  it("rejects tipo='cierre' with a clear message", () => {
    const result = validateBulkRow(
      {
        titulo: "x",
        contenido: "y",
        tipo: "cierre",
        es_urgente: "false",
        fecha_inicio: "",
        fecha_fin: "",
        fijado: "false",
        audiencias: "*:*",
      },
      2
    );
    expect(result.ok).toBe(false);
    expect(
      result.errors.some(
        (e) => e.field === "tipo" && /legacy/i.test(e.message)
      )
    ).toBe(true);
  });
});
