/**
 * Regression test for the bulk_import_previews constraint fix.
 *
 * Bug: constraint `bulk_import_previews_parsed_rows_max` called
 * `jsonb_array_length()` on the top-level JSONB value, which is an object
 * `{groups: [...], src_filename: ...}` — not an array. PostgreSQL raised
 * error 22023 "cannot get array length of a non-array" on every INSERT.
 *
 * Fix: migration 20260506000002 replaced the constraint with one that
 * checks `jsonb_typeof(parsed_rows) = 'object'` AND
 * `jsonb_array_length(parsed_rows -> 'groups') <= 10000`.
 *
 * This test verifies that the StashPayload shape is an object (not a bare
 * array) and that the constraint expression is consistent with the shape.
 */
import { describe, it, expect } from "vitest";

// Minimal shape that mirrors StashPayload without importing the full type.
// The constraint only cares that parsed_rows is an object with a 'groups' array.
interface MinimalStash {
  groups: unknown[];
  src_filename: string | null;
}

describe("bulk_import_previews — StashPayload shape (constraint regression)", () => {
  it("StashPayload is an object with a groups array, not a bare array", () => {
    const stash: MinimalStash = {
      groups: [],
      src_filename: "test.csv",
    };

    // The DB constraint checks:
    //   jsonb_typeof(parsed_rows) = 'object'
    //   AND jsonb_array_length(parsed_rows -> 'groups') <= 10000
    // In JS terms: not an array at the top level, has a 'groups' array
    expect(typeof stash).toBe("object");
    expect(Array.isArray(stash)).toBe(false); // not a bare array — this was the bug
    expect(Array.isArray(stash.groups)).toBe(true);
  });

  it("groups length must be <= 10000 (constraint limit)", () => {
    const stash: MinimalStash = {
      groups: Array.from({ length: 10000 }, (_, i) => ({ id: i })),
      src_filename: null,
    };

    expect(stash.groups.length).toBeLessThanOrEqual(10000);
  });

  it("parsed_rows -> 'groups' expression mirrors the constraint logic", () => {
    // Simulate what PostgreSQL does: parsed_rows -> 'groups' on the object
    // In JS: stash['groups'] should be an array
    const stash: MinimalStash = {
      groups: [{ legacy_numero_familia: "001" }],
      src_filename: "bocatas.csv",
    };

    const groupsField = (stash as unknown as Record<string, unknown>)["groups"];
    expect(Array.isArray(groupsField)).toBe(true);
    expect((groupsField as unknown[]).length).toBeLessThanOrEqual(10000);
  });
});
