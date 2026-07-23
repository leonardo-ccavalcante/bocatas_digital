/**
 * programs.listado.test.ts — pure helpers of the derived monthly list.
 */
import { describe, it, expect } from "vitest";
import { monthWindow, countByPerson } from "./routers/programs.listado";

describe("monthWindow", () => {
  it("covers a 31-day month", () => {
    expect(monthWindow(2026, 1)).toEqual({ start: "2026-01-01", end: "2026-01-31" });
  });
  it("covers February in a leap year", () => {
    expect(monthWindow(2028, 2)).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });
  it("covers February in a non-leap year", () => {
    expect(monthWindow(2026, 2)).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
  it("zero-pads single-digit months", () => {
    expect(monthWindow(2026, 9).start).toBe("2026-09-01");
  });
});

describe("countByPerson", () => {
  it("counts per person and ignores anonymous (null) rows", () => {
    const counts = countByPerson(["a", "b", "a", null, "a", null]);
    expect(counts.get("a")).toBe(3);
    expect(counts.get("b")).toBe(1);
    expect(counts.size).toBe(2);
  });
});
