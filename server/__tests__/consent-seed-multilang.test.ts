/**
 * consent-seed-multilang.test.ts — Phase 6 QA-1D / F-004.
 *
 * CLAUDE.md §3: "Consent is multi-language from day 1. Required languages:
 *   Spanish, Arabic, French, Bambara — covers 90%+ of Bocatas beneficiary
 *   population."
 *
 * This test locks in that the seed migrations cover all 4 languages for
 * `tratamiento_datos_banco_alimentos`. Beneficiaries who only speak
 * Spanish (the largest single subgroup) cannot consent until the 'es'
 * row is seeded — a Gate-1 launch-blocking issue per CLAUDE.md.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function readAllSeedSql(): string {
  // Concatenate every file under supabase/migrations/ (including EXPORTED).
  // Order is irrelevant for INSERT-ONLY checks.
  const dirs = [
    path.join(ROOT, "supabase", "migrations"),
    path.join(ROOT, "supabase", "migrations", "EXPORTED"),
  ];
  let combined = "";
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".sql")) continue;
      combined += "\n--- " + f + "\n";
      combined += fs.readFileSync(path.join(dir, f), "utf-8");
    }
  }
  return combined;
}

const REQUIRED_LANGUAGES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "es", name: "Spanish" },
  { code: "ar", name: "Arabic" },
  { code: "fr", name: "French" },
  { code: "bm", name: "Bambara" },
];

describe("Consent templates — multilang seed coverage (CLAUDE.md §3 + F-004)", () => {
  const sql = readAllSeedSql();

  for (const { code, name } of REQUIRED_LANGUAGES) {
    it(`'tratamiento_datos_banco_alimentos' has a ${name} (${code}) seed row`, () => {
      // Match: ('tratamiento_datos_banco_alimentos', '<code>', ...) anywhere in seeds.
      const re = new RegExp(
        `\\('tratamiento_datos_banco_alimentos',\\s*'${code}'`,
        "i"
      );
      expect(
        re.test(sql),
        `Missing ${name} seed for tratamiento_datos_banco_alimentos. ` +
          "Add a row in a new migration file under supabase/migrations/."
      ).toBe(true);
    });
  }

  it("Spanish seed text references RGPD/Reglamento Europeo (legal hook)", () => {
    // Loose check — copy may evolve; just ensures we didn't seed an empty placeholder.
    const esBlock =
      sql.match(
        /\('tratamiento_datos_banco_alimentos',\s*'es',\s*'[^']*',\s*'([^']+)'/i
      )?.[1] ?? "";
    expect(esBlock.length).toBeGreaterThan(40);
    expect(esBlock.toLowerCase()).toMatch(/rgpd|reglamento|datos personales|consentimiento/);
  });
});
