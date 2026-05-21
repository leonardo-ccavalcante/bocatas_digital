import { describe, it, expect } from "vitest";
import {
  FollowUpCreateSchema,
  GenerateDocumentInputSchema,
  TemplatePublishSchema,
  DOCUMENT_SLUGS,
} from "../documentGen";

describe("FollowUpCreateSchema", () => {
  it("rejects missing family_id", () => {
    const r = FollowUpCreateSchema.safeParse({ fecha: "2026-05-20", notas: "ok" });
    expect(r.success).toBe(false);
  });
  it("rejects invalid fecha format", () => {
    const r = FollowUpCreateSchema.safeParse({ family_id: "any-uuid", fecha: "20260520" });
    expect(r.success).toBe(false);
  });
  it("accepts valid input with notas", () => {
    const r = FollowUpCreateSchema.safeParse({
      family_id: "00000000-0000-0000-0000-000000000001",
      fecha: "2026-05-20",
      notas: "Visita domiciliaria realizada.",
    });
    expect(r.success).toBe(true);
  });
});

describe("GenerateDocumentInputSchema", () => {
  it("rejects unknown slug", () => {
    const r = GenerateDocumentInputSchema.safeParse({ family_id: "...", slug: "unknown" });
    expect(r.success).toBe(false);
  });
  it("accepts informe_social without session", () => {
    const r = GenerateDocumentInputSchema.safeParse({
      family_id: "00000000-0000-0000-0000-000000000001",
      slug: "informe_social",
    });
    expect(r.success).toBe(true);
  });
  it("accepts nota_entrega with session_id", () => {
    const r = GenerateDocumentInputSchema.safeParse({
      family_id: "00000000-0000-0000-0000-000000000001",
      slug: "nota_entrega",
      session_id: "00000000-0000-0000-0000-000000000002",
    });
    expect(r.success).toBe(true);
  });
});

describe("TemplatePublishSchema", () => {
  it("applies defaults for logos and static_blocks", () => {
    const r = TemplatePublishSchema.safeParse({
      slug: "informe_social",
      nombre: "Informe Social",
      storage_path: "informe_social/v1/template.docx",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.logos).toEqual([]);
      expect(r.data.static_blocks).toEqual({});
    }
  });
  it("exposes the three known document slugs", () => {
    expect(DOCUMENT_SLUGS).toEqual(["informe_social", "nota_entrega", "derivacion"]);
  });
});
