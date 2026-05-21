import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");

describe("design foundation v4", () => {
  it("loads Fraunces display font", () => {
    expect(html).toMatch(/Fraunces/);
  });
  it("defines the font-display theme key", () => {
    expect(css).toMatch(/--font-display:\s*'Fraunces'/);
  });
  it("defines the type scale utilities", () => {
    for (const cls of ["text-display-1", "text-display-2", "text-h2", "text-h3", "text-body", "text-body-sm", "text-eyebrow", "tabular-stat"]) {
      expect(css).toContain(`.${cls}`);
    }
  });
});
