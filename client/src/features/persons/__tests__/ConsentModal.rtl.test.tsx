/**
 * Phase B.5.3 — ConsentModal RTL layout for Arabic.
 *
 * `idioma_principal === 'ar'` must render the consent body with `dir="rtl"`
 * so Arabic text reads correctly. Other languages stay LTR.
 *
 * Same render pattern as the fallback test (node env, server-side render).
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

// See ConsentModal.fallback.test.tsx for the rationale of mocking the
// browser supabase client at module-load and the Radix Dialog portal.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn() }) },
    from: () => ({ upsert: vi.fn() }),
  }),
}));

vi.mock("@/components/ui/dialog", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Dialog: Pass,
    DialogContent: Pass,
    DialogHeader: Pass,
    DialogTitle: Pass,
    DialogDescription: Pass,
    DialogFooter: Pass,
  };
});

vi.mock("@/components/ui/scroll-area", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return { ScrollArea: Pass };
});

import { ConsentModal } from "../components/ConsentModal";
import type { ConsentTemplate } from "../schemas";

const ARABIC_TEMPLATES: ConsentTemplate[] = [
  {
    id: "22222222-2222-2222-2222-222222222222",
    purpose: "tratamiento_datos_bocatas",
    idioma: "ar",
    version: "1.0",
    text_content: "أوافق على معالجة بياناتي الشخصية وفقًا لسياسة Bocatas.",
    is_active: true,
    updated_at: null,
  },
];

const SPANISH_TEMPLATES: ConsentTemplate[] = [
  {
    id: "33333333-3333-3333-3333-333333333333",
    purpose: "tratamiento_datos_bocatas",
    idioma: "es",
    version: "1.0",
    text_content: "Acepto el tratamiento de mis datos personales.",
    is_active: true,
    updated_at: null,
  },
];

function render(personLanguage: string, templates: ConsentTemplate[]): string {
  return renderToStaticMarkup(
    <ConsentModal
      open
      personId="00000000-0000-0000-0000-000000000001"
      templates={templates}
      personLanguage={personLanguage}
      onClose={() => {}}
      onSaved={() => {}}
    />,
  );
}

describe("B.5.3 — ConsentModal RTL layout", () => {
  it("sets dir=\"rtl\" on the consent body when personLanguage is `ar`", () => {
    const html = render("ar", ARABIC_TEMPLATES);
    expect(html).toContain('data-testid="consent-body"');
    // The body wrapper carries dir="rtl".
    expect(html).toMatch(/data-testid="consent-body"[^>]*dir="rtl"/);
  });

  it("uses dir=\"ltr\" for `es`", () => {
    const html = render("es", SPANISH_TEMPLATES);
    expect(html).toMatch(/data-testid="consent-body"[^>]*dir="ltr"/);
  });

  it("uses dir=\"ltr\" for `fr` and `bm` (template langs but LTR)", () => {
    for (const lang of ["fr", "bm"]) {
      const html = render(lang, SPANISH_TEMPLATES);
      expect(html).toMatch(/data-testid="consent-body"[^>]*dir="ltr"/);
    }
  });

  it("uses dir=\"ltr\" for non-template languages (en/ro/other) — RTL is Arabic-only", () => {
    for (const lang of ["en", "ro", "other"]) {
      const html = render(lang, SPANISH_TEMPLATES);
      expect(html).toMatch(/data-testid="consent-body"[^>]*dir="ltr"/);
    }
  });

  it("defaults to dir=\"ltr\" when personLanguage prop is omitted", () => {
    const html = renderToStaticMarkup(
      <ConsentModal
        open
        personId="00000000-0000-0000-0000-000000000001"
        templates={SPANISH_TEMPLATES}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(html).toMatch(/data-testid="consent-body"[^>]*dir="ltr"/);
  });
});
