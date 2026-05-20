/**
 * Drift-guard: TS map ↔ SQL CASE list must stay byte-identical (U7 of the
 * Phase 2+3 parallel plan).
 *
 * Two failure modes this catches:
 *   (1) Postal code added to TS map but not the SQL function → server-side
 *       trigger lookups return NULL, family/person rows get distrito=NULL
 *       silently. Mapa shows holes.
 *   (2) Postal code added to SQL function but not the TS map → client-side
 *       lookups (e.g. RegistrationWizard) fail to pre-fill distrito.
 *
 * This test is INTENTIONALLY RED until the M1 migration introducing
 * `madrid_distrito_for(text)` lands. It flips GREEN when:
 *   (a) The migration file exists at supabase/migrations/*_add_codigo_postal_distrito_to_families.sql
 *   (b) Its SQL CASE list has the same postal-code → slug pairs as the TS map.
 *
 * Per the plan's TDD discipline, this is the canonical example: test first,
 * code second.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  DISTRITO_SLUGS,
  isDistritoSlug,
} from "../../shared/madrid/distritos";
import { POSTAL_CODE_TO_DISTRITO } from "../../shared/madrid/postalCodeToDistrito";

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "..", "supabase", "migrations");

/**
 * Madrid municipality has 21 distritos served by ~50-60 unique 5-digit postal
 * codes in the 28001-28055 range plus a few outliers. The "270 entries"
 * figure in early drafts of the plan referred to the broader Comunidad de
 * Madrid (which includes Móstoles, Alcorcón, etc.), not the municipality.
 * The actual entry-count floor for the municipality is ~50 — sets a minimum
 * coverage bar without being so tight that data corrections to a single
 * postal-code break the test.
 */
const MIN_POSTAL_CODE_ENTRIES = 50;

describe("madrid-distrito drift guard (U7)", () => {
  describe("TypeScript-side integrity", () => {
    it("has at least 60 postal-code entries (Madrid municipality floor)", () => {
      const count = Object.keys(POSTAL_CODE_TO_DISTRITO).length;
      expect(count).toBeGreaterThanOrEqual(MIN_POSTAL_CODE_ENTRIES);
    });

    it("every value in the postal-code map is a valid DistritoSlug", () => {
      const invalid = Object.entries(POSTAL_CODE_TO_DISTRITO).filter(
        ([, slug]) => !isDistritoSlug(slug),
      );
      expect(invalid).toEqual([]);
    });

    it("every postal-code key matches the Spanish 5-digit format (28xxx)", () => {
      const malformed = Object.keys(POSTAL_CODE_TO_DISTRITO).filter(
        (code) => !/^28\d{3}$/.test(code),
      );
      expect(malformed).toEqual([]);
    });

    it("DISTRITO_SLUGS has exactly 21 entries (Madrid administrative count)", () => {
      expect(DISTRITO_SLUGS).toHaveLength(21);
    });

    it("postal-code map covers all 21 distritos (no orphaned slug)", () => {
      const covered = new Set(Object.values(POSTAL_CODE_TO_DISTRITO));
      const orphans = DISTRITO_SLUGS.filter((slug) => !covered.has(slug));
      expect(orphans).toEqual([]);
    });
  });

  describe("SQL-side parity (RED until M1 lands)", () => {
    const m1Candidates = existsSync(MIGRATIONS_DIR)
      ? readdirSync(MIGRATIONS_DIR).filter((f) =>
          f.endsWith("_add_codigo_postal_distrito_to_families.sql"),
        )
      : [];

    it("M1 migration file exists", () => {
      expect(m1Candidates.length).toBeGreaterThan(0);
    });

    if (m1Candidates.length > 0) {
      const m1Path = join(MIGRATIONS_DIR, m1Candidates[0]!);
      const sql = readFileSync(m1Path, "utf8");

      it("M1 defines madrid_distrito_for(text) function", () => {
        expect(sql).toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+madrid_distrito_for/i);
      });

      it("M1 SQL CASE list contains every postal-code → distrito pair from the TS map", () => {
        const tsPairs = Object.entries(POSTAL_CODE_TO_DISTRITO);
        const missing = tsPairs.filter(([code, slug]) => {
          // Look for `WHEN '28001' THEN 'salamanca'` (case-insensitive,
          // tolerant of whitespace).
          const pattern = new RegExp(
            `WHEN\\s+'${code}'\\s+THEN\\s+'${slug}'`,
            "i",
          );
          return !pattern.test(sql);
        });
        expect(missing).toEqual([]);
      });

      it("M1 SQL CASE list does not contain postal codes absent from the TS map", () => {
        const tsCodes = new Set(Object.keys(POSTAL_CODE_TO_DISTRITO));
        const sqlCodes = Array.from(
          sql.matchAll(/WHEN\s+'(\d{5})'\s+THEN/gi),
          (m) => m[1]!,
        );
        const extras = sqlCodes.filter((code) => !tsCodes.has(code));
        expect(extras).toEqual([]);
      });
    }
  });
});
