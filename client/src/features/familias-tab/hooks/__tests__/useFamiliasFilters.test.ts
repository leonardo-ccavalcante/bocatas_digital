import { describe, it, expect } from "vitest";
import {
  parseFamiliasFilters,
  buildFamiliasSearch,
  DEFAULT_FAMILIAS_FILTERS,
} from "../useFamiliasFilters";

describe("parseFamiliasFilters", () => {
  it("returns defaults for empty search", () => {
    expect(parseFamiliasFilters("")).toEqual({
      search: undefined,
      estado: "activa",
      sinGuf: false,
      sinInformeSocial: false,
      distrito: undefined,
    });
  });

  it("parses all known params", () => {
    const f = parseFamiliasFilters("?search=Garc%C3%ADa&estado=baja&sin_guf=1&sin_informe=1&distrito=carabanchel");
    expect(f).toEqual({
      search: "García",
      estado: "baja",
      sinGuf: true,
      sinInformeSocial: true,
      distrito: "carabanchel",
    });
  });

  it("falls back to estado='activa' for unknown estado", () => {
    expect(parseFamiliasFilters("?estado=invalid").estado).toBe("activa");
  });

  it("treats missing sin_guf / sin_informe as false", () => {
    const f = parseFamiliasFilters("?estado=all");
    expect(f.sinGuf).toBe(false);
    expect(f.sinInformeSocial).toBe(false);
  });

  it("handles search with leading '?'", () => {
    expect(parseFamiliasFilters("?search=test").search).toBe("test");
  });

  it("handles search without leading '?'", () => {
    expect(parseFamiliasFilters("search=test").search).toBe("test");
  });
});

describe("buildFamiliasSearch", () => {
  it("always sets tab=familias", () => {
    const out = buildFamiliasSearch("", DEFAULT_FAMILIAS_FILTERS);
    expect(new URLSearchParams(out).get("tab")).toBe("familias");
  });

  it("omits default values from URL", () => {
    const out = buildFamiliasSearch("", DEFAULT_FAMILIAS_FILTERS);
    const p = new URLSearchParams(out);
    expect(p.get("search")).toBeNull();
    expect(p.get("estado")).toBeNull();
    expect(p.get("sin_guf")).toBeNull();
    expect(p.get("sin_informe")).toBeNull();
    expect(p.get("distrito")).toBeNull();
  });

  it("encodes search values", () => {
    const out = buildFamiliasSearch("", { ...DEFAULT_FAMILIAS_FILTERS, search: "García López" });
    expect(out).toContain("search=Garc%C3%ADa");
  });

  it("preserves non-filter query params", () => {
    const out = buildFamiliasSearch("?other=1&another=foo", { ...DEFAULT_FAMILIAS_FILTERS, sinGuf: true });
    const p = new URLSearchParams(out);
    expect(p.get("other")).toBe("1");
    expect(p.get("another")).toBe("foo");
    expect(p.get("sin_guf")).toBe("1");
  });

  it("clears a filter when toggled off", () => {
    const out = buildFamiliasSearch("?sin_guf=1", { ...DEFAULT_FAMILIAS_FILTERS, sinGuf: false });
    expect(new URLSearchParams(out).get("sin_guf")).toBeNull();
  });

  it("round-trips through parse -> build", () => {
    const original = {
      search: "test",
      estado: "all" as const,
      sinGuf: true,
      sinInformeSocial: false,
      distrito: "centro",
    };
    const built = buildFamiliasSearch("", original);
    const parsed = parseFamiliasFilters(built);
    expect(parsed).toEqual(original);
  });
});
