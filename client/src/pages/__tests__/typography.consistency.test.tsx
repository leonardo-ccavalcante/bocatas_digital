/**
 * typography.consistency.test.tsx — Regression tests for typography consistency
 *
 * Verifies that main pages and critical components use design tokens (.text-h2, .text-display-2, etc.)
 * instead of raw Tailwind utilities (text-sm, text-lg, font-bold, etc.) for headings and key labels.
 *
 * This prevents future regressions where developers might use raw utilities instead of the
 * established design system defined in client/src/index.css.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";

const SRC = resolve(process.cwd(), "client/src");

describe("Typography consistency — main pages use design tokens", () => {
  // Pages that have main h1 headings
  const mainPages = [
    { file: "pages/CheckIn.tsx", pattern: /<h1[^>]*className="[^"]*text-h2[^"]*"/, desc: "CheckIn h1 uses text-h2" },
    { file: "pages/FamiliasList.tsx", pattern: /<h1[^>]*className="[^"]*text-display-2[^"]*"/, desc: "FamiliasList h1 uses text-display-2" },
    { file: "pages/FamiliasCompliance.tsx", pattern: /<h1[^>]*className="[^"]*text-display-2[^"]*"/, desc: "FamiliasCompliance h1 uses text-display-2" },
    // AdminProgramas.tsx deleted (replaced by redirect to /programas — task item 6)
    { file: "pages/AdminSoftDeleteRecovery.tsx", pattern: /<h1[^>]*className="[^"]*text-display-2[^"]*"/, desc: "AdminSoftDeleteRecovery h1 uses text-display-2" },
    { file: "pages/AdminUsuarios.tsx", pattern: /<h1[^>]*className="[^"]*text-h2[^"]*"/, desc: "AdminUsuarios h1 uses text-h2" },
    { file: "pages/FamiliasEntregas.tsx", pattern: /<h1[^>]*className="[^"]*text-display-2[^"]*"/, desc: "FamiliasEntregas h1 uses text-display-2" },
    { file: "pages/FamiliasInformesSociales.tsx", pattern: /<h1[^>]*className="[^"]*text-display-2[^"]*"/, desc: "FamiliasInformesSociales h1 uses text-display-2" },
  ];

  mainPages.forEach(({ file, pattern, desc }) => {
    it(desc, () => {
      const source = readFileSync(resolve(SRC, file), "utf-8");
      expect(source).toMatch(pattern);
    });
  });

  // Verify no raw text-lg/text-xl/text-2xl/font-bold in h1 tags across main pages
  it("no main page h1 uses raw text-lg/text-xl/text-2xl/font-bold", () => {
    const mainPageFiles = [
      "pages/CheckIn.tsx",
      "pages/FamiliasList.tsx",
      "pages/FamiliasCompliance.tsx",
      // "pages/AdminProgramas.tsx" — deleted (task item 6)
      "pages/AdminSoftDeleteRecovery.tsx",
      "pages/AdminUsuarios.tsx",
      "pages/FamiliasEntregas.tsx",
      "pages/FamiliasInformesSociales.tsx",
    ];

    mainPageFiles.forEach((file) => {
      const source = readFileSync(resolve(SRC, file), "utf-8");
      // h1 should not have raw size utilities
      expect(source).not.toMatch(/<h1[^>]*className="[^"]*text-lg[^"]*font-bold[^"]*"/);
      expect(source).not.toMatch(/<h1[^>]*className="[^"]*text-xl[^"]*font-bold[^"]*"/);
      expect(source).not.toMatch(/<h1[^>]*className="[^"]*text-2xl[^"]*font-bold[^"]*"/);
      expect(source).not.toMatch(/<h1[^>]*className="[^"]*text-3xl[^"]*font-bold[^"]*"/);
    });
  });

  // Verify critical components use design tokens for KPI/stat displays
  it("FamiliaHeader KPI stats use text-h3 design token", () => {
    const source = readFileSync(resolve(SRC, "pages/FamiliaDetalle/FamiliaHeader.tsx"), "utf-8");
    expect(source).toMatch(/text-h3/);
    expect(source).not.toMatch(/text-base font-semibold/);
  });

  it("ComplianceDashboard KPI values use text-display-1 design token", () => {
    const source = readFileSync(resolve(SRC, "features/families/components/ComplianceDashboard.tsx"), "utf-8");
    expect(source).toMatch(/text-display-1/);
    expect(source).not.toMatch(/text-3xl font-bold/);
  });

  it("ProgramCard KPI stat uses text-h3 design token", () => {
    const source = readFileSync(resolve(SRC, "features/programs/components/ProgramCard.tsx"), "utf-8");
    // The KPI stat value should use text-h3 in template literal
    expect(source).toMatch(/tabular-stat.*text-h3/);
  });

  it("FamiliasEntregas KPI numbers use text-display-1 design token", () => {
    const source = readFileSync(resolve(SRC, "pages/FamiliasEntregas.tsx"), "utf-8");
    // Should have text-display-1 for KPI numbers
    expect(source).toMatch(/text-display-1/);
    // Should not have text-2xl font-bold for KPI numbers
    expect(source).not.toMatch(/tabular-stat[^>]*text-2xl font-bold/);
  });
});
