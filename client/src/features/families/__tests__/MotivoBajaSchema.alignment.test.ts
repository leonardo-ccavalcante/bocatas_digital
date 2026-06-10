/**
 * MotivoBajaSchema.alignment.test.ts — Fix 2 regression guard
 *
 * Asserts that MotivoBajaSchema (client) exactly matches the server/DB
 * enum `motivo_baja_familia` defined in:
 *   • migrations/20260411081827_20260410120001_create_enums.sql
 *   • server/routers/families/_shared.ts DeactivateFamilyInputSchema
 *   • client/src/lib/database.types.ts Enums["motivo_baja_familia"]
 *
 * Goes RED if either side is updated without syncing the other.
 */

import { describe, it, expect } from "vitest";
import { MotivoBajaSchema } from "../schemas";

// Canonical DB/server values (source: _shared.ts DeactivateFamilyInputSchema).
// Must stay byte-identical to the DB enum in create_enums.sql and to
// DeactivateFamilyInputSchema.motivo_baja.
const SERVER_ENUM_VALUES = [
  "no_recogida_consecutiva",
  "voluntaria",
  "fraude",
  "cambio_circunstancias",
  "otros",
] as const;

describe("MotivoBajaSchema — client/server alignment", () => {
  it("contains exactly the same values as the DB motivo_baja_familia enum", () => {
    const clientValues = [...MotivoBajaSchema.options].sort();
    const serverValues = [...SERVER_ENUM_VALUES].sort();
    expect(clientValues).toEqual(serverValues);
  });

  it("accepts every server enum value", () => {
    for (const v of SERVER_ENUM_VALUES) {
      const result = MotivoBajaSchema.safeParse(v);
      expect(result.success, `expected '${v}' to be valid in MotivoBajaSchema`).toBe(true);
    }
  });

  it("rejects values that were in the stale client enum but not on the server", () => {
    // These were the 3 stale-only values removed in Fix 2.
    const staleValues = ["solicitud_propia", "cambio_domicilio", "mejora_economica", "fallecimiento", "incumplimiento_normas"];
    for (const v of staleValues) {
      const result = MotivoBajaSchema.safeParse(v);
      expect(result.success, `'${v}' should no longer be valid in MotivoBajaSchema`).toBe(false);
    }
  });

  it("has exactly 5 values (matches DB enum cardinality)", () => {
    expect(MotivoBajaSchema.options).toHaveLength(5);
  });
});
