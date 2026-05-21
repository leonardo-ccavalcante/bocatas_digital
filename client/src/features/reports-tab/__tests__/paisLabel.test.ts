/**
 * paisLabel.test.ts — Unit tests for the ISO-2 → Spanish country name resolver.
 *
 * Node's built-in Intl.DisplayNames is available in the Vitest (Node) environment.
 * Tests use case-insensitive matchers so they pass even if the runtime's ICU data
 * maps "Marruecos" as "Marruecos" vs "Morocco" (i.e. tolerate partial ICU builds)
 * while still asserting known mappings when the full data is present.
 */

import { describe, it, expect } from "vitest";
import { paisLabel } from "../utils/paisLabel";

const hasFullIntl = (() => {
  try {
    const dn = new Intl.DisplayNames(["es"], { type: "region" });
    const name = dn.of("MA");
    return typeof name === "string" && name !== "MA";
  } catch {
    return false;
  }
})();

describe("paisLabel", () => {
  it("'no_indicado' → 'No indicado'", () => {
    expect(paisLabel("no_indicado")).toBe("No indicado");
  });

  it("lowercase 'ma' → Spanish name for Morocco (case-insensitive)", () => {
    const result = paisLabel("ma");
    if (hasFullIntl) {
      expect(result).toMatch(/marruecos/i);
    } else {
      // fallback: uppercase code
      expect(result).toBe("MA");
    }
  });

  it("uppercase 'ES' → Spanish name for Spain (case-insensitive)", () => {
    const result = paisLabel("ES");
    if (hasFullIntl) {
      expect(result).toMatch(/espa/i);
    } else {
      expect(result).toBe("ES");
    }
  });

  it("unknown code 'zz' falls back to non-empty uppercase string", () => {
    const result = paisLabel("zz");
    expect(result.length).toBeGreaterThan(0);
    // Must not be empty string or undefined
    expect(typeof result).toBe("string");
  });

  it("'sn' → Spanish name for Senegal (case-insensitive)", () => {
    const result = paisLabel("sn");
    if (hasFullIntl) {
      expect(result).toMatch(/senegal/i);
    } else {
      expect(result).toBe("SN");
    }
  });
});
