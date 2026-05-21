import { describe, it, expect } from "vitest";
import type { Database } from "../../client/src/lib/database.types";

// Compile-time assertions: if a generated row type is missing a column or has
// the wrong shape, this file fails to TYPECHECK (pnpm check), which is the real
// gate. The runtime expect() calls just keep vitest happy.

describe("E1 migration tables", () => {
  it("family_follow_ups row type has required columns", () => {
    type Row = Database["public"]["Tables"]["family_follow_ups"]["Row"];
    const _: Row = {
      id: "uuid",
      family_id: "uuid",
      fecha: "2026-01-01",
      notas: null,
      created_by: "42",
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };
    expect(_.family_id).toBe("uuid");
  });

  it("document_templates row type has required columns", () => {
    type Row = Database["public"]["Tables"]["document_templates"]["Row"];
    const _: Row = {
      id: "uuid",
      slug: "informe_social",
      nombre: "Informe Social",
      version: 1,
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      storage_path: "informe_social/v1/template.docx",
      logos: [],
      static_blocks: {},
      placeholders: [],
      is_active: true,
      created_by: "42",
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(_.slug).toBe("informe_social");
  });

  it("document_render_log row type has required columns", () => {
    type Row = Database["public"]["Tables"]["document_render_log"]["Row"];
    const _: Row = {
      id: "uuid",
      family_id: "uuid",
      template_slug: "informe_social",
      template_id: null,
      actor_id: "42",
      file_name: "informe-social-F0042-2026-05-20.docx",
      storage_path: null,
      rendered_at: new Date().toISOString(),
    };
    expect(_.actor_id).toBe("42");
  });
});
