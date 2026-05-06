/**
 * i18n tests — covers pure functions and translation completeness.
 * These tests run server-side (vitest) importing from client/src/lib/i18n.
 */
import { describe, it, expect } from "vitest";
import i18n, {
  SUPPORTED_LANGUAGES,
  RTL_LANGUAGES,
  isRTL,
  type SupportedLanguageCode,
} from "../../client/src/lib/i18n";

// ── SUPPORTED_LANGUAGES ───────────────────────────────────────────────────────
describe("SUPPORTED_LANGUAGES", () => {
  it("has exactly 12 entries", () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(12);
  });

  it("each entry has code, name, and dir", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(lang).toHaveProperty("code");
      expect(lang).toHaveProperty("name");
      expect(lang).toHaveProperty("dir");
    }
  });

  it("all dir values are ltr or rtl", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(["ltr", "rtl"]).toContain(lang.dir);
    }
  });

  it("Arabic (ar) is RTL", () => {
    const ar = SUPPORTED_LANGUAGES.find((l) => l.code === "ar");
    expect(ar?.dir).toBe("rtl");
  });

  it("Darija (da) is RTL", () => {
    const da = SUPPORTED_LANGUAGES.find((l) => l.code === "da");
    expect(da?.dir).toBe("rtl");
  });

  it("Spanish (es) is LTR", () => {
    const es = SUPPORTED_LANGUAGES.find((l) => l.code === "es");
    expect(es?.dir).toBe("ltr");
  });

  it("all non-Arabic/Darija languages are LTR", () => {
    const ltrLangs = SUPPORTED_LANGUAGES.filter((l) => !["ar", "da"].includes(l.code));
    for (const lang of ltrLangs) {
      expect(lang.dir).toBe("ltr");
    }
  });
});

// ── RTL_LANGUAGES ─────────────────────────────────────────────────────────────
describe("RTL_LANGUAGES", () => {
  it("contains Arabic", () => expect(RTL_LANGUAGES).toContain("ar"));
  it("contains Darija", () => expect(RTL_LANGUAGES).toContain("da"));
  it("has exactly 2 RTL languages", () => expect(RTL_LANGUAGES).toHaveLength(2));
  it("does not contain Spanish", () => expect(RTL_LANGUAGES).not.toContain("es"));
  it("does not contain French", () => expect(RTL_LANGUAGES).not.toContain("fr"));
});

// ── isRTL() ───────────────────────────────────────────────────────────────────
describe("isRTL()", () => {
  it("returns true for Arabic", () => expect(isRTL("ar")).toBe(true));
  it("returns true for Darija", () => expect(isRTL("da")).toBe(true));
  it("returns false for Spanish", () => expect(isRTL("es")).toBe(false));
  it("returns false for French", () => expect(isRTL("fr")).toBe(false));
  it("returns false for English", () => expect(isRTL("en")).toBe(false));
  it("returns false for Catalan", () => expect(isRTL("ca")).toBe(false));
  it("returns false for unknown language", () => expect(isRTL("xx")).toBe(false));
  it("returns false for empty string", () => expect(isRTL("")).toBe(false));
});

// ── i18n initialization ───────────────────────────────────────────────────────
describe("i18n initialization", () => {
  it("initializes with Spanish as fallback language", () => {
    const fallback = i18n.options.fallbackLng;
    const arr = Array.isArray(fallback) ? fallback : [fallback];
    expect(arr).toContain("es");
  });

  it("supports all 12 languages", () => {
    const supported = i18n.options.supportedLngs as string[];
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    for (const code of codes) {
      expect(supported).toContain(code);
    }
  });

  it("has interpolation escaping disabled (React handles it)", () => {
    expect(i18n.options.interpolation?.escapeValue).toBe(false);
  });

  it("uses localStorage for language persistence", () => {
    const detection = i18n.options.detection as Record<string, unknown>;
    expect(detection?.caches).toContain("localStorage");
  });

  it("uses bocatas_language as localStorage key", () => {
    const detection = i18n.options.detection as Record<string, unknown>;
    expect(detection?.lookupLocalStorage).toBe("bocatas_language");
  });
});

// ── Translation completeness ──────────────────────────────────────────────────
const REQUIRED_KEYS = [
  "common.home", "common.logout", "common.loading", "common.error",
  "common.save", "common.cancel",
  "nav.dashboard", "nav.families", "nav.persons", "nav.deliveries",
  "forms.submit", "forms.required",
  "errors.notFound", "errors.unauthorized",
  "families.title", "families.add",
  "persons.title", "persons.add",
  "deliveries.title", "checkin.title", "dashboard.title",
];

const LANGUAGES: SupportedLanguageCode[] = [
  "es", "ca", "gl", "eu", "fr", "wo", "ar", "pt-br", "en", "ff", "bm", "da",
];

describe("Translation completeness", () => {
  for (const lang of LANGUAGES) {
    describe(`Language: ${lang}`, () => {
      for (const key of REQUIRED_KEYS) {
        it(`has key "${key}"`, () => {
          const value = i18n.getFixedT(lang)(key);
          // i18next returns the key itself when missing
          expect(value).not.toBe(key);
          expect(value).toBeTruthy();
        });
      }
    });
  }
});

// ── Interpolation ─────────────────────────────────────────────────────────────
describe("Interpolation", () => {
  it("interpolates {{name}} in welcome message (es)", () => {
    const result = i18n.getFixedT("es")("common.welcome", { name: "María" });
    expect(result).toContain("María");
    expect(result).not.toContain("{{name}}");
  });

  it("interpolates {{name}} in welcome message (ar)", () => {
    const result = i18n.getFixedT("ar")("common.welcome", { name: "محمد" });
    expect(result).toContain("محمد");
    expect(result).not.toContain("{{name}}");
  });

  it("interpolates {{min}} in minLength validation (es)", () => {
    const result = i18n.getFixedT("es")("forms.minLength", { min: 3 });
    expect(result).toContain("3");
    expect(result).not.toContain("{{min}}");
  });
});
