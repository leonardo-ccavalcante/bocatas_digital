/**
 * computeVerbalFallback — the consent verbal-translation banner predicate.
 *
 * THE-04  (regression): a template-language lane (ar/fr/bm) that is active but
 *         EMPTY must trigger the banner — the rows would otherwise fall back to
 *         Spanish silently.
 * THE-04b (regression): a lane that translates SOME purposes but not all must
 *         ALSO trigger the banner — the uncovered purposes fall back to Spanish
 *         per purpose (buildConsentRows), and the old `length === 0` gate let a
 *         non-empty-but-partial lane suppress the banner. Over-warn, never
 *         under-warn.
 *
 * MYTHOS: THE-04 / THE-04b
 */
import { describe, it, expect } from "vitest";
import { computeVerbalFallback } from "../_consentRows";
import type { ConsentTemplate } from "../../../schemas";

function tpl(purpose: string, idioma: string): ConsentTemplate {
  return {
    id: `${idioma}-${purpose}`,
    // purpose/idioma are enum-typed in the schema; the test feeds valid values.
    purpose: purpose as ConsentTemplate["purpose"],
    idioma: idioma as ConsentTemplate["idioma"],
    version: "1.0",
    text_content: `${purpose} (${idioma})`,
    is_active: true,
    updated_at: null,
  };
}

// Two Spanish-defined purposes — the universe a translated lane must cover.
const ES_TEMPLATES: ConsentTemplate[] = [
  tpl("tratamiento_datos_bocatas", "es"),
  tpl("comunicaciones_whatsapp", "es"),
];

describe("computeVerbalFallback", () => {
  it("returns false for a Spanish-speaking person (no banner)", () => {
    expect(
      computeVerbalFallback({
        personLanguage: "es",
        consentTemplatesEs: ES_TEMPLATES,
        consentTemplatesLang: ES_TEMPLATES,
      })
    ).toBe(false);
  });

  it("returns false for null/undefined language", () => {
    expect(
      computeVerbalFallback({
        personLanguage: null,
        consentTemplatesEs: ES_TEMPLATES,
        consentTemplatesLang: [],
      })
    ).toBe(false);
  });

  it("returns true for a language with no template lane at all (wo → es)", () => {
    expect(
      computeVerbalFallback({
        personLanguage: "wo",
        consentTemplatesEs: ES_TEMPLATES,
        // wo collapses to the 'es' lane, so consentTemplatesLang IS the es set.
        consentTemplatesLang: ES_TEMPLATES,
      })
    ).toBe(true);
  });

  it("returns true for an active-but-EMPTY template lane (ar, THE-04)", () => {
    expect(
      computeVerbalFallback({
        personLanguage: "ar",
        consentTemplatesEs: ES_TEMPLATES,
        consentTemplatesLang: [],
      })
    ).toBe(true);
  });

  it("returns false when the lane covers EVERY Spanish purpose (full translation)", () => {
    expect(
      computeVerbalFallback({
        personLanguage: "ar",
        consentTemplatesEs: ES_TEMPLATES,
        consentTemplatesLang: [
          tpl("tratamiento_datos_bocatas", "ar"),
          tpl("comunicaciones_whatsapp", "ar"),
        ],
      })
    ).toBe(false);
  });

  it("returns true when the lane covers SOME but not all purposes (THE-04b)", () => {
    expect(
      computeVerbalFallback({
        personLanguage: "ar",
        consentTemplatesEs: ES_TEMPLATES,
        // Only one of the two Spanish purposes is translated → the other renders
        // Spanish silently. The non-empty lane must NOT suppress the banner.
        consentTemplatesLang: [tpl("tratamiento_datos_bocatas", "ar")],
      })
    ).toBe(true);
  });
});
