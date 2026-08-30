import { describe, it, expect } from "vitest";
import { normalizeNameSearch, nameSearchTokens } from "../nameSearch";

describe("normalizeNameSearch", () => {
  it("lowercases, trims and strips diacritics (mirror of DB f_unaccent(lower(...)))", () => {
    expect(normalizeNameSearch("  María García LÓPEZ ")).toBe("maria garcia lopez");
  });

  it("folds ñ/ç the same way Postgres unaccent does", () => {
    expect(normalizeNameSearch("Muñoz Çelik")).toBe("munoz celik");
  });
});

describe("nameSearchTokens", () => {
  it("splits on any whitespace run and drops empty tokens", () => {
    expect(nameSearchTokens("  María   García ")).toEqual(["maria", "garcia"]);
  });

  it("returns [] for whitespace-only input (min-length zod guards pass '   ')", () => {
    expect(nameSearchTokens("   ")).toEqual([]);
  });
});
