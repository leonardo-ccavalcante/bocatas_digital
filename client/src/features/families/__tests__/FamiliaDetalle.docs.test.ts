import { describe, it, expect } from "vitest";
import { FAMILIA_DOCS_CONFIG } from "@/features/families/constants";

// Mirrors the derivation logic in FamilyDocsCard / MembersDocsCard
type DocRow = {
  documento_tipo: string;
  documento_url: string | null;
  member_index?: number;
};

function deriveFamilyLevelItems(uploaded: DocRow[]) {
  const familyDocs = FAMILIA_DOCS_CONFIG.filter((d) => !d.perMember);
  return familyDocs.map((d) => {
    const row = uploaded.find((u) => u.documento_tipo === d.key);
    return {
      id: d.key,
      label: d.label,
      required: d.required,
      checked: !!row?.documento_url,
      documentUrl: row?.documento_url ?? null,
    };
  });
}

function derivePerMemberItems(memberIndex: number, uploaded: DocRow[]) {
  const memberDocs = FAMILIA_DOCS_CONFIG.filter((d) => d.perMember);
  return memberDocs.map((d) => {
    const row = uploaded.find(
      (u) => u.documento_tipo === d.key && u.member_index === memberIndex
    );
    return {
      id: d.key,
      label: d.label,
      required: true,
      checked: !!row?.documento_url,
      documentUrl: row?.documento_url ?? null,
    };
  });
}

// ageInYears + isAdultOrUnknown moved to @/features/families/utils/age and tested
// directly in client/src/features/families/utils/__tests__/age.test.ts

describe("Documentacion tab — family-level checklist", () => {
  it("renders 4 family-level docs from FAMILIA_DOCS_CONFIG (Padron, Justificante, Informe social, Autorizacion)", () => {
    const items = deriveFamilyLevelItems([]);
    expect(items.length).toBe(4);
    expect(items.map((i) => i.id)).toEqual([
      "padron_municipal",
      "justificante_situacion",
      "informe_social",
      "autorizacion_recogida",
    ]);
  });

  it("does NOT include the old hardcoded ['DNI', 'Pasaporte', 'Comprobante domicilio']", () => {
    const items = deriveFamilyLevelItems([]);
    const labels = items.map((i) => i.label);
    expect(labels).not.toContain("DNI");
    expect(labels).not.toContain("Pasaporte");
    expect(labels).not.toContain("Comprobante domicilio");
  });

  it("status badge becomes Subido (checked=true) when documento_url is present", () => {
    const items = deriveFamilyLevelItems([
      { documento_tipo: "padron_municipal", documento_url: "https://x" },
    ]);
    const padron = items.find((i) => i.id === "padron_municipal")!;
    expect(padron.checked).toBe(true);
    expect(padron.documentUrl).toBe("https://x");
  });

  it("status badge stays Pendiente (checked=false) when documento_url is null (placeholder)", () => {
    const items = deriveFamilyLevelItems([
      { documento_tipo: "padron_municipal", documento_url: null },
    ]);
    const padron = items.find((i) => i.id === "padron_municipal")!;
    expect(padron.checked).toBe(false);
  });

  it("Justificante and Autorizacion are NOT marked required", () => {
    const items = deriveFamilyLevelItems([]);
    expect(items.find((i) => i.id === "justificante_situacion")!.required).toBe(false);
    expect(items.find((i) => i.id === "autorizacion_recogida")!.required).toBe(false);
  });

  it("Padron and Informe social ARE marked required", () => {
    const items = deriveFamilyLevelItems([]);
    expect(items.find((i) => i.id === "padron_municipal")!.required).toBe(true);
    expect(items.find((i) => i.id === "informe_social")!.required).toBe(true);
  });
});

describe("Documentacion tab — per-member checklist", () => {
  it("renders 3 per-member docs (identidad + 2 consents)", () => {
    const items = derivePerMemberItems(0, []);
    expect(items.length).toBe(3);
    expect(items.map((i) => i.id)).toEqual([
      "documento_identidad",
      "consent_bocatas",
      "consent_banco_alimentos",
    ]);
  });

  it("ALL per-member docs are required (none can be relaxed)", () => {
    const items = derivePerMemberItems(0, []);
    expect(items.every((i) => i.required)).toBe(true);
  });

  it("status filters by member_index — member 0's doc does not satisfy member 1", () => {
    const upload = [
      {
        documento_tipo: "documento_identidad",
        documento_url: "https://m0",
        member_index: 0,
      },
    ];
    const items0 = derivePerMemberItems(0, upload);
    const items1 = derivePerMemberItems(1, upload);
    expect(items0.find((i) => i.id === "documento_identidad")!.checked).toBe(true);
    expect(items1.find((i) => i.id === "documento_identidad")!.checked).toBe(false);
  });
});

// ageInYears coverage lives in client/src/features/families/utils/__tests__/age.test.ts
