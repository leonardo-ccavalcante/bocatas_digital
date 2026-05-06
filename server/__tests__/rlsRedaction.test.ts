/**
 * rlsRedaction.test.ts — Unit tests for the shared high-risk field
 * redaction helper (Phase B.2.1).
 *
 * Covers:
 *   - admin / superadmin: NO redaction (returns row as-is)
 *   - voluntario (role='user'): redaction applied
 *   - undefined / null role: redaction applied (fail-closed default)
 *   - null row: returns null
 *   - array of rows: each row redacted independently
 *   - immutability: input row is never mutated
 */
import { describe, it, expect } from "vitest";
import {
  redactHighRiskFields,
  redactHighRiskFieldsArray,
  HIGH_RISK_FIELD_NAMES,
} from "../_core/rlsRedaction";

const fullRow = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  nombre: "Juan",
  apellidos: "García",
  situacion_legal: "regular",
  recorrido_migratorio: "Llegó en 2020 vía Marruecos",
  foto_documento_url: "https://cdn/doc.jpg",
  fase_itinerario: "acogida",
};

describe("redactHighRiskFields — elevated roles", () => {
  it("returns row unchanged for admin", () => {
    const result = redactHighRiskFields("admin", fullRow);
    for (const field of HIGH_RISK_FIELD_NAMES) {
      expect(result).toHaveProperty(field);
    }
    expect(result.nombre).toBe("Juan");
  });

  it("returns row unchanged for superadmin", () => {
    const result = redactHighRiskFields("superadmin", fullRow);
    for (const field of HIGH_RISK_FIELD_NAMES) {
      expect(result).toHaveProperty(field);
    }
  });
});

describe("redactHighRiskFields — non-elevated roles", () => {
  it("strips all three fields for voluntario (role='user')", () => {
    const result = redactHighRiskFields("user", fullRow);
    for (const field of HIGH_RISK_FIELD_NAMES) {
      expect(result).not.toHaveProperty(field);
    }
    expect(result.nombre).toBe("Juan");
    expect(result.apellidos).toBe("García");
  });

  it("strips all three fields for explicit voluntario role", () => {
    const result = redactHighRiskFields("voluntario", fullRow);
    for (const field of HIGH_RISK_FIELD_NAMES) {
      expect(result).not.toHaveProperty(field);
    }
  });

  it("strips all three fields when role is undefined (fail-closed)", () => {
    const result = redactHighRiskFields(undefined, fullRow);
    for (const field of HIGH_RISK_FIELD_NAMES) {
      expect(result).not.toHaveProperty(field);
    }
  });

  it("strips all three fields when role is null (fail-closed)", () => {
    const result = redactHighRiskFields(null, fullRow);
    for (const field of HIGH_RISK_FIELD_NAMES) {
      expect(result).not.toHaveProperty(field);
    }
  });

  it("strips all three fields for an unknown role string (fail-closed)", () => {
    const result = redactHighRiskFields("guest", fullRow);
    for (const field of HIGH_RISK_FIELD_NAMES) {
      expect(result).not.toHaveProperty(field);
    }
  });
});

describe("redactHighRiskFields — null row", () => {
  it("returns null when row is null", () => {
    const result = redactHighRiskFields("user", null);
    expect(result).toBeNull();
  });

  it("returns null even for elevated roles when row is null", () => {
    const result = redactHighRiskFields("admin", null);
    expect(result).toBeNull();
  });
});

describe("redactHighRiskFields — immutability", () => {
  it("does not mutate the input row when redacting", () => {
    const input = { ...fullRow };
    const snapshot = { ...fullRow };
    redactHighRiskFields("user", input);
    expect(input).toEqual(snapshot);
  });

  it("does not mutate the input row for elevated callers", () => {
    const input = { ...fullRow };
    const snapshot = { ...fullRow };
    redactHighRiskFields("admin", input);
    expect(input).toEqual(snapshot);
  });
});

describe("redactHighRiskFieldsArray", () => {
  it("redacts every row for non-elevated callers", () => {
    const rows = [fullRow, { ...fullRow, id: "other-id" }];
    const result = redactHighRiskFieldsArray("user", rows);
    expect(result).toHaveLength(2);
    for (const row of result) {
      for (const field of HIGH_RISK_FIELD_NAMES) {
        expect(row).not.toHaveProperty(field);
      }
    }
  });

  it("returns rows untouched for elevated callers", () => {
    const rows = [fullRow, { ...fullRow, id: "other-id" }];
    const result = redactHighRiskFieldsArray("admin", rows);
    expect(result).toHaveLength(2);
    for (const row of result) {
      for (const field of HIGH_RISK_FIELD_NAMES) {
        expect(row).toHaveProperty(field);
      }
    }
  });

  it("returns a new array (does not mutate input)", () => {
    const rows = [fullRow];
    const result = redactHighRiskFieldsArray("user", rows);
    expect(result).not.toBe(rows);
    expect(rows[0]).toHaveProperty("situacion_legal");
  });

  it("handles empty arrays", () => {
    expect(redactHighRiskFieldsArray("user", [])).toEqual([]);
    expect(redactHighRiskFieldsArray("admin", [])).toEqual([]);
  });
});
