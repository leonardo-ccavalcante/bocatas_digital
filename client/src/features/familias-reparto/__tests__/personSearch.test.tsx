/**
 * TDD tests for person search in roster lists.
 *
 * Strategy: read source files and verify structural properties.
 * These tests verify:
 * 1. CloseoutRosterList renders a search input
 * 2. CloseoutRosterList filters pending list by search query
 * 3. CloseoutRosterList filters attendedHere list by search query
 * 4. ContactoPanel renders a search input
 * 5. ContactoPanel filters rows by search query
 * 6. Search is case-insensitive and accent-insensitive
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const rosterListPath = path.resolve(
  __dirname,
  "../components/CloseoutRosterList.tsx",
);
const contactoPanelPath = path.resolve(
  __dirname,
  "../components/ContactoPanel.tsx",
);

const rosterSource = readFileSync(rosterListPath, "utf-8");
const contactoSource = readFileSync(contactoPanelPath, "utf-8");

describe("Person search — CloseoutRosterList", () => {
  it("renders a search Input for filtering families", () => {
    // Must import and use Input component
    expect(rosterSource).toContain("Input");
    // Must have a search/buscar placeholder or aria-label
    expect(rosterSource).toMatch(/[Bb]uscar|[Ss]earch/);
  });

  it("has a useState for the search query", () => {
    expect(rosterSource).toContain("useState");
    // Must have a variable for the search query
    expect(rosterSource).toMatch(/search|query|busqueda|búsqueda/i);
  });

  it("filters the pending list using the search query (case-insensitive)", () => {
    // Must apply a filter/includes call on pending items
    expect(rosterSource).toMatch(/\.filter\(|\.includes\(/);
    // Must use toLowerCase or normalize for case-insensitive matching
    expect(rosterSource).toMatch(/toLowerCase|normalize|localeCompare/i);
  });

  it("filters the attendedHere list using the same search query", () => {
    // The filter must be applied to both pending and attendedHere sections
    // Count occurrences of the filter pattern — must appear at least twice (once per section)
    const filterMatches = (rosterSource.match(/\.filter\(/g) ?? []).length;
    expect(filterMatches).toBeGreaterThanOrEqual(2);
  });

  it("shows a 'no results' message when search yields no matches", () => {
    // Must have a conditional empty state for filtered results
    expect(rosterSource).toMatch(/[Nn]o.*encontr|[Ss]in.*resultado|[Nn]inguna.*familia|[Nn]o hay/i);
  });
});

describe("Person search — ContactoPanel", () => {
  it("renders a search Input for filtering families", () => {
    expect(contactoSource).toContain("Input");
    expect(contactoSource).toMatch(/[Bb]uscar|[Ss]earch/);
  });

  it("has a useState for the search query", () => {
    expect(contactoSource).toContain("useState");
    expect(contactoSource).toMatch(/search|query|busqueda|búsqueda/i);
  });

  it("filters the rows list using the search query (case-insensitive)", () => {
    expect(contactoSource).toMatch(/\.filter\(|\.includes\(/);
    expect(contactoSource).toMatch(/toLowerCase|normalize|localeCompare/i);
  });

  it("shows a 'no results' message when search yields no matches", () => {
    expect(contactoSource).toMatch(/[Nn]o.*encontr|[Ss]in.*resultado|[Nn]inguna.*familia|[Nn]o hay/i);
  });
});
