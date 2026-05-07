import { describe, it, expect } from "vitest";
import { parseTabFromSearch, buildTabSearch, PROGRAM_TABS, ENABLED_TABS } from "../useTabParam";

describe("parseTabFromSearch", () => {
  it("defaults to 'familias' when no tab param is present", () => {
    expect(parseTabFromSearch("")).toBe("familias");
    expect(parseTabFromSearch("?other=1")).toBe("familias");
  });

  it("returns the tab param when valid", () => {
    expect(parseTabFromSearch("?tab=mapa")).toBe("mapa");
    expect(parseTabFromSearch("?tab=reports")).toBe("reports");
    expect(parseTabFromSearch("?tab=uploads")).toBe("uploads");
    expect(parseTabFromSearch("?tab=derivar")).toBe("derivar");
    expect(parseTabFromSearch("?tab=familias")).toBe("familias");
  });

  it("falls back to 'familias' when tab param is unknown", () => {
    expect(parseTabFromSearch("?tab=invalid")).toBe("familias");
    expect(parseTabFromSearch("?tab=")).toBe("familias");
  });

  it("preserves other query params (read-only sanity)", () => {
    expect(parseTabFromSearch("?other=1&tab=mapa&another=2")).toBe("mapa");
  });
});

describe("buildTabSearch", () => {
  it("sets tab when no other params present", () => {
    const next = buildTabSearch("", "uploads");
    expect(next).toBe("tab=uploads");
  });

  it("preserves other params and sets tab", () => {
    const next = buildTabSearch("?other=1&distrito=centro", "mapa");
    const params = new URLSearchParams(next);
    expect(params.get("tab")).toBe("mapa");
    expect(params.get("other")).toBe("1");
    expect(params.get("distrito")).toBe("centro");
  });

  it("overwrites an existing tab param", () => {
    const next = buildTabSearch("?tab=familias", "uploads");
    expect(new URLSearchParams(next).get("tab")).toBe("uploads");
  });
});

describe("PROGRAM_TABS / ENABLED_TABS", () => {
  it("PROGRAM_TABS lists exactly the 5 tabs in order", () => {
    expect(PROGRAM_TABS).toEqual(["familias", "mapa", "reports", "uploads", "derivar"]);
  });

  it("ENABLED_TABS in Phase 1 is exactly familias + uploads", () => {
    expect(ENABLED_TABS).toEqual(["familias", "uploads"]);
  });

  it("every ENABLED_TAB is also a PROGRAM_TAB", () => {
    for (const t of ENABLED_TABS) {
      expect(PROGRAM_TABS).toContain(t);
    }
  });
});
