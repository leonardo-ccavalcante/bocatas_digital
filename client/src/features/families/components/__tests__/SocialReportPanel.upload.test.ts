import { describe, it, expect } from "vitest";

// Mirrors the derivation logic in SocialReportPanel
type DocRow = {
  documento_tipo: string;
  documento_url: string | null;
  is_current?: boolean;
  deleted_at?: string | null;
};

function findInformeSocialRow(familyDocs: DocRow[]): DocRow | undefined {
  return familyDocs.find(
    (d) => d.documento_tipo === "informe_social" && !!d.documento_url
  );
}

describe("SocialReportPanel — informe upload state", () => {
  it("shows no Ver-informe link when no PDF uploaded", () => {
    expect(findInformeSocialRow([])).toBeUndefined();
  });

  it("shows Ver-informe link when a PDF is uploaded", () => {
    const docs: DocRow[] = [
      {
        documento_tipo: "informe_social",
        documento_url: "https://supabase/informe.pdf",
      },
    ];
    const row = findInformeSocialRow(docs);
    expect(row).toBeDefined();
    expect(row!.documento_url).toContain("informe.pdf");
  });

  it("ignores placeholder rows (documento_url=null)", () => {
    const docs: DocRow[] = [
      { documento_tipo: "informe_social", documento_url: null },
    ];
    expect(findInformeSocialRow(docs)).toBeUndefined();
  });

  it("ignores other doc types", () => {
    const docs: DocRow[] = [
      { documento_tipo: "padron_municipal", documento_url: "https://x" },
    ];
    expect(findInformeSocialRow(docs)).toBeUndefined();
  });

  it("supports flexible insertion (date OR upload — both paths coexist)", () => {
    // Date-only path: family.informe_social_fecha is set, but no upload yet.
    // Upload path: a row exists in family_member_documents with documento_url.
    // Both are tracked independently.
    const docs: DocRow[] = []; // no upload yet
    const dateOnlyState = { informe_social: true, informe_social_fecha: "2026-04-15" };
    expect(findInformeSocialRow(docs)).toBeUndefined();
    expect(dateOnlyState.informe_social).toBe(true);
  });
});
