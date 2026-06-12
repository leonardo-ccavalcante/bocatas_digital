/**
 * EstadoFamiliaSchema.alignment.test.ts — MYTHOS TES-06 regression guard
 *
 * Asserts that EstadoFamiliaSchema (client) exactly matches the DB CHECK on
 * `families.estado`, verified live in prod as:
 *   CHECK (estado = ANY (ARRAY['activa'::text, 'baja'::text]))
 *
 * Before TES-06 the client enum carried a stale third value 'suspendida' that
 * the CHECK never allowed — any write of it would fail at runtime with 23514,
 * and the value was used nowhere in the app. This goes RED if either side drifts.
 */

import { describe, it, expect } from "vitest";
import { EstadoFamiliaSchema } from "../schemas";

// Canonical DB values (source: prod CHECK on families.estado).
// Must stay byte-identical to the families.estado CHECK constraint.
const DB_CHECK_VALUES = ["activa", "baja"] as const;

describe("EstadoFamiliaSchema — client/DB CHECK alignment", () => {
  it("contains exactly the same values as the families.estado CHECK", () => {
    const clientValues = [...EstadoFamiliaSchema.options].sort();
    const dbValues = [...DB_CHECK_VALUES].sort();
    expect(clientValues).toEqual(dbValues);
  });

  it("accepts every value the DB CHECK allows", () => {
    for (const v of DB_CHECK_VALUES) {
      const result = EstadoFamiliaSchema.safeParse(v);
      expect(result.success, `expected '${v}' to be valid in EstadoFamiliaSchema`).toBe(true);
    }
  });

  it("rejects 'suspendida' — the stale value the DB CHECK never allowed (TES-06)", () => {
    const result = EstadoFamiliaSchema.safeParse("suspendida");
    expect(result.success, "'suspendida' must not be accepted: families.estado CHECK rejects it").toBe(false);
  });

  it("has exactly 2 values (matches the families.estado CHECK cardinality)", () => {
    expect(EstadoFamiliaSchema.options).toHaveLength(2);
  });
});
