import { describe, it, expect } from "vitest";
import {
  computePendingForFamily,
  REQUIRED_FAMILY_DOC_TYPES,
  REQUIRED_PER_MEMBER_DOC_TYPES,
} from "../families-doc-helpers";

const today = new Date("2026-04-30");
const yesterday = new Date("2026-04-29").toISOString();

describe("computePendingForFamily — Plan Gap E (legacy families no longer silently miss)", () => {
  const family = { id: "fam-1", familia_numero: 1, created_at: yesterday };
  const titular = { id: "p-titular", nombre: "Maria", apellidos: "Garcia" };

  it("returns ALL required family-level + per-member docs as pending when zero uploads exist", () => {
    const pending = computePendingForFamily(family, titular, [], [], today);
    const expectedCount =
      REQUIRED_FAMILY_DOC_TYPES.length + REQUIRED_PER_MEMBER_DOC_TYPES.length;
    expect(pending.length).toBe(expectedCount);
  });

  it("legacy family (no family_member_documents rows at all) STILL surfaces as pending — Gap E fix", () => {
    const pending = computePendingForFamily(family, titular, [], [], today);
    expect(pending.length).toBeGreaterThan(0);
  });

  it("titular IS counted as a member ≥14 (not skipped — was a bug)", () => {
    const pending = computePendingForFamily(family, titular, [], [], today);
    const titularPending = pending.filter((p) => p.member_index === 0);
    expect(titularPending.length).toBe(REQUIRED_PER_MEMBER_DOC_TYPES.length);
  });

  it("uploaded family-level doc is removed from pending list", () => {
    const uploads = [
      {
        family_id: "fam-1",
        member_index: -1,
        documento_tipo: "padron_municipal",
        documento_url: "u1",
        deleted_at: null,
        is_current: true,
      },
    ];
    const pending = computePendingForFamily(family, titular, [], uploads, today);
    expect(
      pending.find(
        (p) => p.doc_type === "padron_municipal" && p.member_index === -1
      )
    ).toBeUndefined();
  });

  it("placeholder row (documento_url=null) does NOT remove from pending list", () => {
    const placeholder = [
      {
        family_id: "fam-1",
        member_index: -1,
        documento_tipo: "padron_municipal",
        documento_url: null,
        deleted_at: null,
        is_current: true,
      },
    ];
    const pending = computePendingForFamily(
      family,
      titular,
      [],
      placeholder,
      today
    );
    expect(
      pending.find(
        (p) => p.doc_type === "padron_municipal" && p.member_index === -1
      )
    ).toBeDefined();
  });

  it("minor members (under 14) are not counted as needing per-member docs", () => {
    const minors = [
      {
        nombre: "Hijo",
        apellidos: null,
        person_id: "p-child",
        fecha_nacimiento: "2015-01-01",
      },
    ];
    const pending = computePendingForFamily(
      family,
      titular,
      minors,
      [],
      today
    );
    const minorPending = pending.filter((p) => p.member_index === 1);
    expect(minorPending.length).toBe(0);
  });

  it("days_pending is computed from family.created_at", () => {
    const pending = computePendingForFamily(family, titular, [], [], today);
    expect(pending[0].days_pending).toBeGreaterThanOrEqual(1);
    expect(pending[0].days_pending).toBeLessThan(3);
  });
});
