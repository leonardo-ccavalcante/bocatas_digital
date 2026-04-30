import { describe, it, expect } from "vitest";
import { recomputeBooleanCache } from "../families-doc-helpers";

describe("Boolean cache recompute on soft-delete", () => {
  it("cache stays TRUE when one of TWO uploads is deleted", () => {
    const rows = [
      {
        family_id: "fam-1",
        documento_tipo: "documento_identidad",
        documento_url: "u1",
        deleted_at: new Date().toISOString(),
        is_current: false,
      },
      {
        family_id: "fam-1",
        documento_tipo: "documento_identidad",
        documento_url: "u2",
        deleted_at: null,
        is_current: true,
      },
    ];
    expect(
      recomputeBooleanCache(rows, "fam-1", "documento_identidad")
    ).toBe(true);
  });

  it("cache flips to FALSE when the only upload is soft-deleted", () => {
    const rows = [
      {
        family_id: "fam-1",
        documento_tipo: "padron_municipal",
        documento_url: "u1",
        deleted_at: new Date().toISOString(),
        is_current: false,
      },
    ];
    expect(recomputeBooleanCache(rows, "fam-1", "padron_municipal")).toBe(false);
  });

  it("cache flips to FALSE for a per-member doc when ALL members have their doc deleted", () => {
    const rows = [
      {
        family_id: "fam-1",
        documento_tipo: "consent_bocatas",
        documento_url: "u-m0",
        deleted_at: new Date().toISOString(),
        is_current: false,
      },
      {
        family_id: "fam-1",
        documento_tipo: "consent_bocatas",
        documento_url: "u-m1",
        deleted_at: new Date().toISOString(),
        is_current: false,
      },
    ];
    expect(recomputeBooleanCache(rows, "fam-1", "consent_bocatas")).toBe(false);
  });
});
