import { describe, it, expect } from "vitest";
import { isDocUploaded, recomputeBooleanCache } from "../families-doc-helpers";

describe("Deferred-at-intake placeholder rows", () => {
  const placeholder = {
    family_id: "fam-1",
    documento_tipo: "documento_identidad",
    documento_url: null,
    deleted_at: null,
    is_current: true,
  };
  const realUpload = {
    family_id: "fam-1",
    documento_tipo: "documento_identidad",
    documento_url: "https://x",
    deleted_at: null,
    is_current: true,
  };

  it("a placeholder row counts as Pendiente (not Subido)", () => {
    expect(isDocUploaded(placeholder)).toBe(false);
  });

  it("a placeholder row does NOT flip the boolean cache", () => {
    expect(
      recomputeBooleanCache([placeholder], "fam-1", "documento_identidad")
    ).toBe(false);
  });

  it("a real upload after a placeholder DOES flip the cache (placeholder is replaced)", () => {
    expect(
      recomputeBooleanCache([realUpload], "fam-1", "documento_identidad")
    ).toBe(true);
  });

  it("placeholder + real upload: cache flips TRUE if any current row has URL", () => {
    expect(
      recomputeBooleanCache(
        [placeholder, realUpload],
        "fam-1",
        "documento_identidad"
      )
    ).toBe(true);
  });
});
