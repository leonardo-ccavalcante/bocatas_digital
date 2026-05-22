import { describe, expect, it } from "vitest";
import { assertPiiFree, STAFF_ROLES } from "../events";

describe("assertPiiFree", () => {
  it("accepts PII-free enum/count props", () => {
    expect(() => assertPiiFree({ method: "qr" })).not.toThrow();
    expect(() => assertPiiFree({ type: "nie", count: 3 })).not.toThrow();
    expect(() => assertPiiFree(undefined)).not.toThrow();
  });

  it("rejects a property whose KEY names PII", () => {
    expect(() => assertPiiFree({ email: "x" })).toThrow();
    expect(() => assertPiiFree({ telefono: "x" })).toThrow();
    expect(() => assertPiiFree({ nombre: "x" })).toThrow();
  });

  it("rejects a property whose VALUE matches a PII pattern", () => {
    expect(() => assertPiiFree({ note: "jane@example.com" })).toThrow();
    expect(() => assertPiiFree({ ref: "X1234567L" })).toThrow();
    expect(() => assertPiiFree({ ref: "12345678Z" })).toThrow();
    expect(() => assertPiiFree({ ref: "600123456" })).toThrow();
  });
});

describe("STAFF_ROLES", () => {
  it("contains only the three staff roles", () => {
    expect(STAFF_ROLES.has("admin")).toBe(true);
    expect(STAFF_ROLES.has("voluntario")).toBe(true);
    expect(STAFF_ROLES.has("superadmin")).toBe(true);
    expect(STAFF_ROLES.has("beneficiario")).toBe(false);
    expect(STAFF_ROLES.has("user")).toBe(false);
  });
});
