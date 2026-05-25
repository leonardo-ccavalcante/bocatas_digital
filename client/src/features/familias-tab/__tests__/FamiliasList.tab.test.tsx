/**
 * FamiliasList.tab.test.tsx — TDD tests for FamiliasList component within ProgramTabs
 *
 * Tests verify that the FamiliasList component (used inside programa_familias tab)
 * has a "Nueva familia" button to allow creating new families, not just listing existing ones.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SRC = resolve(process.cwd(), "client/src");

describe("FamiliasList tab — Nueva familia button", () => {
  it("should have a 'Nueva familia' button or link in the component", () => {
    const source = readFileSync(
      resolve(SRC, "features/familias-tab/FamiliasList.tsx"),
      "utf-8"
    );
    // Check for either a button with "Nueva familia" text or a link to /familias/nueva
    const hasNewFamilyButton =
      source.includes("Nueva familia") ||
      source.includes("/familias/nueva");
    expect(hasNewFamilyButton).toBe(true);
  });

  it("should have a header section with title and action button", () => {
    const source = readFileSync(
      resolve(SRC, "features/familias-tab/FamiliasList.tsx"),
      "utf-8"
    );
    // Check for a header structure with flex layout for title and actions
    const hasHeaderStructure =
      source.includes("flex items-center justify-between") ||
      source.includes("flex flex-wrap gap");
    expect(hasHeaderStructure).toBe(true);
  });

  it("should link to /familias/nueva for creating new families", () => {
    const source = readFileSync(
      resolve(SRC, "features/familias-tab/FamiliasList.tsx"),
      "utf-8"
    );
    expect(source).toMatch(/href=["']\/familias\/nueva["']/);
  });

  it("should conditionally show button only for admin users", () => {
    const source = readFileSync(
      resolve(SRC, "features/familias-tab/FamiliasList.tsx"),
      "utf-8"
    );
    // Check for isAdmin check before rendering the button
    expect(source).toMatch(/isAdmin\s*&&/);
    // Verify useAuth hook is imported
    expect(source).toMatch(/useAuth/);
  });
});
