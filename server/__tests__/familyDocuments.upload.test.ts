import { describe, it, expect } from "vitest";
import { recomputeBooleanCache, isDocUploaded } from "../families-doc-helpers";

describe("isDocUploaded — what counts as 'received'", () => {
  it("returns false for null row", () => {
    expect(isDocUploaded(null)).toBe(false);
    expect(isDocUploaded(undefined)).toBe(false);
  });

  it("returns false for placeholder (documento_url = null)", () => {
    expect(
      isDocUploaded({ documento_url: null, deleted_at: null, is_current: true })
    ).toBe(false);
  });

  it("returns false for soft-deleted row", () => {
    expect(
      isDocUploaded({
        documento_url: "https://x",
        deleted_at: new Date().toISOString(),
        is_current: true,
      })
    ).toBe(false);
  });

  it("returns false for non-current row (versioning)", () => {
    expect(
      isDocUploaded({
        documento_url: "https://x",
        deleted_at: null,
        is_current: false,
      })
    ).toBe(false);
  });

  it("returns true for current uploaded row", () => {
    expect(
      isDocUploaded({
        documento_url: "https://x",
        deleted_at: null,
        is_current: true,
      })
    ).toBe(true);
  });
});

describe("recomputeBooleanCache — EXISTS rule", () => {
  const rows = [
    {
      family_id: "fam-1",
      documento_tipo: "padron_municipal",
      documento_url: "u1",
      deleted_at: null,
      is_current: true,
    },
    {
      family_id: "fam-1",
      documento_tipo: "padron_municipal",
      documento_url: "u0",
      deleted_at: null,
      is_current: false,
    }, // older version
    {
      family_id: "fam-1",
      documento_tipo: "documento_identidad",
      documento_url: "u2",
      deleted_at: null,
      is_current: true,
    },
    {
      family_id: "fam-2",
      documento_tipo: "padron_municipal",
      documento_url: "u3",
      deleted_at: null,
      is_current: true,
    },
  ];

  it("returns true when current uploaded row exists for family + doc_type", () => {
    expect(recomputeBooleanCache(rows, "fam-1", "padron_municipal")).toBe(true);
  });

  it("ignores other families' rows", () => {
    expect(recomputeBooleanCache(rows, "fam-3", "padron_municipal")).toBe(false);
  });

  it("ignores non-current rows", () => {
    const onlyOlder = [
      {
        family_id: "fam-1",
        documento_tipo: "padron_municipal",
        documento_url: "u0",
        deleted_at: null,
        is_current: false,
      },
    ];
    expect(recomputeBooleanCache(onlyOlder, "fam-1", "padron_municipal")).toBe(
      false
    );
  });

  it("ignores placeholder (null URL) rows even if is_current", () => {
    const placeholder = [
      {
        family_id: "fam-1",
        documento_tipo: "padron_municipal",
        documento_url: null,
        deleted_at: null,
        is_current: true,
      },
    ];
    expect(
      recomputeBooleanCache(placeholder, "fam-1", "padron_municipal")
    ).toBe(false);
  });

  it("returns true if ANY adult member has the per-member doc (EXISTS semantics)", () => {
    const memberRows = [
      {
        family_id: "fam-1",
        documento_tipo: "consent_bocatas",
        documento_url: "u-mem-1",
        deleted_at: null,
        is_current: true,
      },
    ];
    expect(recomputeBooleanCache(memberRows, "fam-1", "consent_bocatas")).toBe(
      true
    );
  });
});
