/**
 * Phase B.5.2 — ConsentModal verbal-translation fallback.
 *
 * Population-threshold rule (see consent.template.completeness.test.ts):
 * a person whose `idioma_principal` is one of the long-tail languages
 * (en/ro/zh/wo/other) has NO template in their language. The Spanish
 * template is shown as fallback content, and a banner instructs the
 * volunteer to provide a verbal translation before signing.
 *
 * Vitest env is `node` (no jsdom). We render to a static HTML string with
 * `react-dom/server` — same pattern as ResultCard.a11y.test.tsx.
 *
 * NOTE: shadcn/ui's `Dialog` only mounts children when `open=true`. We
 * pass `open={true}` to force the body into the markup.
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

// The browser supabase client throws at module-load when VITE env vars are
// absent (see client/src/lib/supabase/client.ts). Vitest runs with `node`
// env, so we mock it. The render path never invokes storage or DB calls
// during static markup, so a no-op shim is sufficient.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn() }) },
    from: () => ({ upsert: vi.fn() }),
  }),
}));

// Radix Dialog renders into a portal which requires a DOM. With vitest's
// `node` env we bypass the portal and inline the children so the body
// markup is reachable from `renderToStaticMarkup`. This is a render-shim,
// not a behavior change of the component under test.
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

const SPANISH_TEMPLATES: ConsentTemplate[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    purpose: "tratamiento_datos_bocatas",
    idioma: "es",
    version: "1.0",
    text_content:
      "Acepto el tratamiento de mis datos personales conforme a la política de Bocatas.",
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

describe("B.5.2 — ConsentModal verbal-translation fallback", () => {
  it("renders the verbal-translation banner when person speaks a non-template language (en)", () => {
    const html = render("en", SPANISH_TEMPLATES);
    expect(html).toContain('data-testid="verbal-translation-banner"');
    expect(html).toMatch(/traducci[oó]n verbal/i);
  });

  it("renders the banner for `ro` (Romanian) — same fallback path", () => {
    const html = render("ro", SPANISH_TEMPLATES);
    expect(html).toContain('data-testid="verbal-translation-banner"');
  });

  it("renders the banner for `other` — open-bucket persons get fallback too", () => {
    const html = render("other", SPANISH_TEMPLATES);
    expect(html).toContain('data-testid="verbal-translation-banner"');
  });

  it("still renders the Spanish template body alongside the banner", () => {
    const html = render("en", SPANISH_TEMPLATES);
    // The Spanish text is in the rendered template list (line-clamped, but
    // present in the markup).
    expect(html).toContain("tratamiento de mis datos personales");
    // And the banner is there too.
    expect(html).toContain('data-testid="verbal-translation-banner"');
  });

  it("does NOT render the banner when person speaks a template language (es)", () => {
    const html = render("es", SPANISH_TEMPLATES);
    expect(html).not.toContain('data-testid="verbal-translation-banner"');
  });

  it("does NOT render the banner for `ar`/`fr`/`bm` (template languages)", () => {
    for (const lang of ["ar", "fr", "bm"]) {
      const html = render(lang, SPANISH_TEMPLATES);
      expect(html).not.toContain('data-testid="verbal-translation-banner"');
    }
  });

  it("does NOT render the banner when `personLanguage` prop is omitted (back-compat)", () => {
    const html = renderToStaticMarkup(
      <ConsentModal
        open
        personId="00000000-0000-0000-0000-000000000001"
        templates={SPANISH_TEMPLATES}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(html).not.toContain('data-testid="verbal-translation-banner"');
  });
});
