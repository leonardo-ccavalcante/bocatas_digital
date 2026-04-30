import { describe, it, expect } from "vitest";
import { parseAudienciasDSL } from "../announcements-helpers";

describe("parseAudienciasDSL", () => {
  it("parses single role+program: voluntario:comedor", () => {
    const result = parseAudienciasDSL("voluntario:comedor");
    expect(result.errors).toHaveLength(0);
    expect(result.rules).toEqual([
      { roles: ["voluntario"], programs: ["comedor"] },
    ]);
  });

  it("parses multiple roles with wildcard program: admin,superadmin:*", () => {
    const result = parseAudienciasDSL("admin,superadmin:*");
    expect(result.errors).toHaveLength(0);
    expect(result.rules).toEqual([
      { roles: ["admin", "superadmin"], programs: [] },
    ]);
  });

  it("parses wildcard role with multiple programs: *:familia,formacion", () => {
    const result = parseAudienciasDSL("*:familia,formacion");
    expect(result.errors).toHaveLength(0);
    expect(result.rules).toEqual([
      { roles: [], programs: ["familia", "formacion"] },
    ]);
  });

  it("parses wildcard both sides *:* → everyone", () => {
    const result = parseAudienciasDSL("*:*");
    expect(result.errors).toHaveLength(0);
    expect(result.rules).toEqual([{ roles: [], programs: [] }]);
  });

  it("parses multiple rules separated by semicolon: voluntario:comedor;admin:*", () => {
    const result = parseAudienciasDSL("voluntario:comedor;admin:*");
    expect(result.errors).toHaveLength(0);
    expect(result.rules).toHaveLength(2);
    expect(result.rules[0]).toEqual({
      roles: ["voluntario"],
      programs: ["comedor"],
    });
    expect(result.rules[1]).toEqual({ roles: ["admin"], programs: [] });
  });

  it("tolerates whitespace around separators: admin , superadmin : * ; voluntario : comedor", () => {
    const result = parseAudienciasDSL("admin , superadmin : * ; voluntario : comedor");
    expect(result.errors).toHaveLength(0);
    expect(result.rules).toHaveLength(2);
    expect(result.rules[0]).toEqual({
      roles: ["admin", "superadmin"],
      programs: [],
    });
    expect(result.rules[1]).toEqual({
      roles: ["voluntario"],
      programs: ["comedor"],
    });
  });

  it("returns error for unknown role token", () => {
    const result = parseAudienciasDSL("unknown_role:comedor");
    expect(result.rules).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].token).toBe("unknown_role");
  });

  it("returns error for unknown program token", () => {
    const result = parseAudienciasDSL("voluntario:unknown_program");
    expect(result.rules).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].token).toBe("unknown_program");
  });

  it("returns error for empty input string", () => {
    const result = parseAudienciasDSL("");
    expect(result.rules).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].token).toBe("");
    expect(result.errors[0].message).toMatch(/audiencias requerida/i);
  });

  it("returns error when rule has extra colon: a:b:c", () => {
    const result = parseAudienciasDSL("admin:comedor:extra");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns error when rule has no colon: admin", () => {
    const result = parseAudienciasDSL("admin");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.rules).toHaveLength(0);
  });

  it("handles mixed valid + invalid rules: voluntario:comedor;admin:fakeprogram", () => {
    const result = parseAudienciasDSL("voluntario:comedor;admin:fakeprogram");
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0]).toEqual({
      roles: ["voluntario"],
      programs: ["comedor"],
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].token).toBe("fakeprogram");
  });

  it("includes lineNumber in error message when provided", () => {
    const result = parseAudienciasDSL("", 5);
    expect(result.errors[0].message).toContain("5");
  });

  it("returns error for bare colon ':' (both sides empty after stripping *)", () => {
    const result = parseAudienciasDSL(":");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.rules).toHaveLength(0);
  });
});
