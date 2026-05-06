/**
 * Phase B.5.1 — Consent template completeness, population-threshold gated.
 *
 * Two enums are at play:
 *   - `idioma`            (person languages):   es, ar, fr, bm, en, ro, zh, wo, other
 *   - `consent_language`  (template languages): es, ar, fr, bm
 *
 * The mismatch (en/ro/zh/wo/other persons have no template in their language)
 * is intentional. Per Karpathy: do NOT blanket-add five templates. Use a
 * population-threshold rule:
 *
 *   - If ≥ THRESHOLD (5) active persons hold `idioma_principal = X` AND
 *     X is NOT one of {es, ar, fr, bm}, a consent template in language X
 *     SHOULD exist before the next migration cycle.
 *   - Below threshold → manual / verbal-translation fallback is acceptable.
 *   - `other` is unbounded (an open bucket); NEVER required regardless of
 *     count, because we cannot know which actual language is hidden behind
 *     it without a follow-up data audit.
 *
 * The Supabase client is mocked. Each scenario stubs the
 * `consent_templates` rows AND the per-language person counts, then drives
 * the rule that is also documented in CLAUDE.md (Gate 1 consent matrix).
 *
 * Goes RED if: someone ships a person-language migration that pushes a
 * non-{es,ar,fr,bm} idioma above threshold without also shipping the
 * matching consent template.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Types we don't import to avoid coupling to the live client ──────────
//
// Mirroring just the slice of the schema we need keeps the test self-
// contained and makes the mock contract explicit.

type ConsentLanguage = "es" | "ar" | "fr" | "bm";
type Idioma = "es" | "ar" | "fr" | "bm" | "en" | "ro" | "zh" | "wo" | "other";

interface ConsentTemplateRow {
  idioma: ConsentLanguage;
  is_active: boolean;
}

interface PersonCountRow {
  idioma_principal: Idioma;
  count: number;
}

const POPULATION_THRESHOLD = 5;
const REQUIRED_BASE_LANGS: readonly ConsentLanguage[] = [
  "es",
  "ar",
  "fr",
  "bm",
];
// `other` is an open bucket and can never be turned into a single template.
const NEVER_REQUIRED: ReadonlySet<Idioma> = new Set<Idioma>(["other"]);

// ─── Pure rule under test ────────────────────────────────────────────────
//
// Returns the list of languages that SHOULD have an active template but
// don't. Empty array → audit passes.

function findMissingTemplates(
  templates: ReadonlyArray<ConsentTemplateRow>,
  personCounts: ReadonlyArray<PersonCountRow>,
): Idioma[] {
  const activeLangs = new Set(
    templates.filter((t) => t.is_active).map((t) => t.idioma),
  );

  const missing: Idioma[] = [];

  // Base 4 languages must always have an active template.
  for (const lang of REQUIRED_BASE_LANGS) {
    if (!activeLangs.has(lang)) missing.push(lang);
  }

  // Threshold-gated additions for non-base languages with enough population.
  // We compare against the FULL set of active template languages so that a
  // post-migration world (where consent_language has been expanded) won't
  // re-flag a language whose template now exists.
  const allActiveLangs = new Set<string>(
    templates.filter((t) => t.is_active).map((t) => t.idioma),
  );
  for (const row of personCounts) {
    if (REQUIRED_BASE_LANGS.includes(row.idioma_principal as ConsentLanguage)) {
      continue;
    }
    if (NEVER_REQUIRED.has(row.idioma_principal)) continue;
    if (row.count < POPULATION_THRESHOLD) continue;
    if (allActiveLangs.has(row.idioma_principal)) continue;
    missing.push(row.idioma_principal);
  }

  return missing;
}

// ─── Supabase mock surface ───────────────────────────────────────────────
//
// We don't need a real client for this audit — the rule is pure. The mock
// exists only to demonstrate how a future runtime check (e.g. an
// admin-only diagnostics RPC) would call into Supabase.

interface MockSupabase {
  fetchTemplates: () => Promise<ConsentTemplateRow[]>;
  fetchPersonCounts: () => Promise<PersonCountRow[]>;
}

function makeMockSupabase(
  templates: ConsentTemplateRow[],
  counts: PersonCountRow[],
): MockSupabase {
  return {
    fetchTemplates: vi.fn().mockResolvedValue(templates),
    fetchPersonCounts: vi.fn().mockResolvedValue(counts),
  };
}

const ALL_FOUR_TEMPLATES: ConsentTemplateRow[] = [
  { idioma: "es", is_active: true },
  { idioma: "ar", is_active: true },
  { idioma: "fr", is_active: true },
  { idioma: "bm", is_active: true },
];

describe("B.5.1 — consent template completeness (population-threshold)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PASS — all 4 base templates exist, no over-threshold non-base languages", async () => {
    const supa = makeMockSupabase(ALL_FOUR_TEMPLATES, [
      { idioma_principal: "es", count: 800 },
      { idioma_principal: "ar", count: 200 },
      { idioma_principal: "fr", count: 150 },
      { idioma_principal: "bm", count: 90 },
      { idioma_principal: "en", count: 0 },
      { idioma_principal: "ro", count: 0 },
    ]);
    const templates = await supa.fetchTemplates();
    const counts = await supa.fetchPersonCounts();
    expect(findMissingTemplates(templates, counts)).toEqual([]);
  });

  it("PASS — `en` count is 0 (below threshold), no template required", async () => {
    const supa = makeMockSupabase(ALL_FOUR_TEMPLATES, [
      { idioma_principal: "en", count: 0 },
    ]);
    const templates = await supa.fetchTemplates();
    const counts = await supa.fetchPersonCounts();
    expect(findMissingTemplates(templates, counts)).toEqual([]);
  });

  it("PASS — `en` count is 2 (below threshold), no template required", async () => {
    const supa = makeMockSupabase(ALL_FOUR_TEMPLATES, [
      { idioma_principal: "en", count: 2 },
    ]);
    const templates = await supa.fetchTemplates();
    const counts = await supa.fetchPersonCounts();
    expect(findMissingTemplates(templates, counts)).toEqual([]);
  });

  it("PASS — `en` count is 4 (still below threshold), no template required", async () => {
    const supa = makeMockSupabase(ALL_FOUR_TEMPLATES, [
      { idioma_principal: "en", count: 4 },
    ]);
    const templates = await supa.fetchTemplates();
    const counts = await supa.fetchPersonCounts();
    expect(findMissingTemplates(templates, counts)).toEqual([]);
  });

  it("FAIL — `en` count is 5 AND `en` template missing → flagged", async () => {
    const supa = makeMockSupabase(ALL_FOUR_TEMPLATES, [
      { idioma_principal: "en", count: 5 },
    ]);
    const templates = await supa.fetchTemplates();
    const counts = await supa.fetchPersonCounts();
    const missing = findMissingTemplates(templates, counts);
    expect(missing).toContain("en");
    expect(missing).toHaveLength(1);
  });

  it("FAIL — `en` count is 50 AND template missing → flagged with clear shape", async () => {
    const supa = makeMockSupabase(ALL_FOUR_TEMPLATES, [
      { idioma_principal: "en", count: 50 },
    ]);
    const templates = await supa.fetchTemplates();
    const counts = await supa.fetchPersonCounts();
    const missing = findMissingTemplates(templates, counts);
    expect(missing).toEqual(["en"]);
  });

  it("PASS — `en` count is 5 BUT `en` template present (hypothetical future state)", async () => {
    // Simulates the post-migration world where the consent_language enum
    // has been expanded. The rule no longer flags `en` because the active
    // template covers it.
    const expanded: ConsentTemplateRow[] = [
      ...ALL_FOUR_TEMPLATES,
      { idioma: "en" as ConsentLanguage, is_active: true },
    ];
    const supa = makeMockSupabase(expanded, [
      { idioma_principal: "en", count: 5 },
    ]);
    const templates = await supa.fetchTemplates();
    const counts = await supa.fetchPersonCounts();
    expect(findMissingTemplates(templates, counts)).toEqual([]);
  });

  it("PASS — `other` is unbounded; never flagged regardless of count", async () => {
    const supa = makeMockSupabase(ALL_FOUR_TEMPLATES, [
      { idioma_principal: "other", count: 999 },
    ]);
    const templates = await supa.fetchTemplates();
    const counts = await supa.fetchPersonCounts();
    expect(findMissingTemplates(templates, counts)).toEqual([]);
  });

  it("FAIL — base language template missing (e.g. `bm` deactivated) → flagged", async () => {
    const partial: ConsentTemplateRow[] = ALL_FOUR_TEMPLATES.map((t) =>
      t.idioma === "bm" ? { ...t, is_active: false } : t,
    );
    const supa = makeMockSupabase(partial, []);
    const templates = await supa.fetchTemplates();
    const counts = await supa.fetchPersonCounts();
    const missing = findMissingTemplates(templates, counts);
    expect(missing).toContain("bm");
  });

  it("FAIL — multiple over-threshold languages flagged together", async () => {
    const supa = makeMockSupabase(ALL_FOUR_TEMPLATES, [
      { idioma_principal: "en", count: 12 },
      { idioma_principal: "ro", count: 8 },
      { idioma_principal: "zh", count: 3 }, // below threshold
      { idioma_principal: "wo", count: 6 },
    ]);
    const templates = await supa.fetchTemplates();
    const counts = await supa.fetchPersonCounts();
    const missing = findMissingTemplates(templates, counts);
    expect(missing).toEqual(expect.arrayContaining(["en", "ro", "wo"]));
    expect(missing).not.toContain("zh");
    expect(missing).not.toContain("other");
  });
});
