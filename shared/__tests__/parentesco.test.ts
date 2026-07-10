import { describe, it, expect } from "vitest";
import { RELACION_LABEL_ES, parentescoLabelEs } from "../parentesco";

describe("parentescoLabelEs", () => {
  it("maps every HSDS English value to a Spanish label (no raw token leaks)", () => {
    expect(parentescoLabelEs("child")).toBe("Hijo/a");
    expect(parentescoLabelEs("parent")).toBe("Padre/Madre");
    expect(parentescoLabelEs("sibling")).toBe("Hermano/a");
    expect(parentescoLabelEs("other")).toBe("Otro");
  });

  it("maps legacy Spanish slugs (intake/CSV) to display labels", () => {
    expect(parentescoLabelEs("esposo_a")).toBe("Esposo/a");
    expect(parentescoLabelEs("hijo_a")).toBe("Hijo/a");
    expect(parentescoLabelEs("abuelo_a")).toBe("Abuelo/a");
  });

  it("covers the full DB CHECK vocabulary — every allowed value has a label", () => {
    const CHECK_VALUES = [
      "parent", "child", "sibling", "other",
      "esposo_a", "hijo_a", "madre", "padre",
      "suegro_a", "hermano_a", "abuelo_a", "otro",
    ];
    for (const v of CHECK_VALUES) {
      expect(RELACION_LABEL_ES[v], `missing label for "${v}"`).toBeTruthy();
      // A label must never be the raw English token — that is the reported bug.
      if (["parent", "child", "sibling", "other"].includes(v)) {
        expect(RELACION_LABEL_ES[v]).not.toBe(v);
      }
    }
  });

  it("falls back to the provided fallback for unknown/blank (never invents)", () => {
    expect(parentescoLabelEs(null)).toBe("");
    expect(parentescoLabelEs(undefined)).toBe("");
    expect(parentescoLabelEs("")).toBe("");
    expect(parentescoLabelEs("junk", "junk")).toBe("junk");
    expect(parentescoLabelEs(null, "—")).toBe("—");
  });
});
