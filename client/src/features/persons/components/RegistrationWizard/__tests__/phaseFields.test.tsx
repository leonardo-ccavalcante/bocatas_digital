/**
 * PHASE_FIELDS coverage — goNext() only validates the fields listed per phase
 * (react-hook-form trigger()); an unlisted field's error surfaces only as a
 * server 400 at submit (F047/F058). Pins the per-phase coverage.
 */
import { describe, it, expect } from "vitest";
import { PHASE_FIELDS } from "../_shared";
import { PersonCreateSchema } from "../../../schemas";

describe("PHASE_FIELDS — wizard phase validation coverage (F058)", () => {
  it("phase 1 validates the arrival-date input rendered in the Documento section", () => {
    expect(PHASE_FIELDS[0]).toContain("fecha_llegada_espana");
  });

  it("phase 2 validates the format-constrained Contacto inputs", () => {
    expect(PHASE_FIELDS[1]).toEqual(
      expect.arrayContaining(["telefono", "email", "codigo_postal"])
    );
  });

  it("lists only real PersonCreateSchema keys — trigger() silently no-ops on unknown names", () => {
    const keys = new Set(Object.keys(PersonCreateSchema.shape));
    for (const field of PHASE_FIELDS.flat()) {
      expect(keys.has(field), `'${field}' is not a PersonCreateSchema key`).toBe(true);
    }
  });
});
