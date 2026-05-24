/**
 * responsive.mobile2.test.tsx — TDD RED tests for mobile responsiveness issues (session 2)
 *
 * Root causes identified via systematic-debugging:
 *
 * 1. PersonsFilterBar: The outer filter-chips container lacks `w-full`, and the two
 *    ToggleGroup wrappers don't have `shrink-0`. Without w-full the overflow-x-auto
 *    container has no bounded width to scroll within, so chips overflow instead of
 *    scrolling. The ToggleGroupItem base class adds `flex-1` which competes with
 *    our shrink-0 on the item level.
 *
 * 2. PersonaHeader: The UUID span (`font-mono text-xs`) has no `truncate` class.
 *    A 36-char UUID forces the flex-wrap row to be wider than the viewport, making
 *    the sticky header wider than the screen on mobile.
 *
 * 3. Typography consistency: Several pages use raw Tailwind size utilities
 *    (text-sm, text-xl, text-2xl, font-bold) instead of the design-token classes
 *    (.text-body, .text-h2, .text-display-2, etc.) defined in index.css.
 *    Key pages to fix: CheckIn.tsx h1, FamiliasList.tsx h1, FamiliasCompliance.tsx h1.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";

const SRC = resolve(process.cwd(), "client/src");

// ── Test 1: PersonsFilterBar — filter chip container must have w-full ──────────
describe("PersonsFilterBar — filter chip container width", () => {
  it("outer chip-row div has w-full so overflow-x-auto has a bounded width to scroll within", () => {
    const source = readFileSync(
      resolve(SRC, "features/persons/components/PersonsFilterBar.tsx"),
      "utf-8"
    );
    // The div that wraps the two ToggleGroups must have w-full
    // Without w-full, overflow-x-auto has no bounded container → chips overflow
    expect(source).toMatch(/overflow-x-auto[^"]*w-full|w-full[^"]*overflow-x-auto/);
  });

  it("each ToggleGroup wrapper has shrink-0 to prevent compression inside the scrollable row", () => {
    const source = readFileSync(
      resolve(SRC, "features/persons/components/PersonsFilterBar.tsx"),
      "utf-8"
    );
    // Both ToggleGroup components must have shrink-0 in their className
    // so they don't compress when the flex container is narrower than their content
    const toggleGroupMatches = source.match(/ToggleGroup[\s\S]*?className="[^"]*shrink-0[^"]*"/g);
    expect(toggleGroupMatches).not.toBeNull();
    expect(toggleGroupMatches!.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Test 2: PersonaHeader — UUID must be truncated ───────────────────────────
describe("PersonaHeader — UUID display truncation", () => {
  it("the UUID span has truncate class to prevent the 36-char UUID from expanding the sticky header beyond viewport width", () => {
    const source = readFileSync(
      resolve(SRC, "features/persons/components/detail/PersonaHeader.tsx"),
      "utf-8"
    );
    // The font-mono span showing person.id must have truncate
    // A 36-char UUID without truncate forces the header wider than the mobile viewport
    expect(source).toMatch(/font-mono[^"]*truncate|truncate[^"]*font-mono/);
  });
});

// ── Test 3: Typography consistency — key pages use design tokens ─────────────
describe("Typography consistency — design tokens instead of raw Tailwind sizes", () => {
  it("CheckIn.tsx h1 uses text-h2 or text-display-2 instead of raw text-lg/text-xl", () => {
    const source = readFileSync(resolve(SRC, "pages/CheckIn.tsx"), "utf-8");
    // The main h1 "Check-in" must use a design token class, not raw text-lg/text-xl/font-bold
    // Raw: className="text-lg font-bold" → should be: className="text-h2"
    expect(source).not.toMatch(/<h1[^>]*className="[^"]*text-lg font-bold[^"]*"/);
  });

  it("FamiliasList.tsx h1 uses text-display-2 instead of raw text-xl/text-2xl font-bold", () => {
    const source = readFileSync(resolve(SRC, "pages/FamiliasList.tsx"), "utf-8");
    // The page h1 must use a design token, not raw size + weight combo
    expect(source).not.toMatch(/<h1[^>]*className="[^"]*text-xl[^"]*font-bold[^"]*"/);
  });

  it("FamiliasCompliance.tsx h1 uses text-display-2 instead of raw text-2xl font-bold", () => {
    const source = readFileSync(resolve(SRC, "pages/FamiliasCompliance.tsx"), "utf-8");
    expect(source).not.toMatch(/<h1[^>]*className="[^"]*text-2xl font-bold[^"]*"/);
  });
});
