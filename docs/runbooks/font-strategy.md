# Font Strategy

## Current state (Phase 6.b, Gate 1 Spanish-only)

- **Family:** Inter (variable font, opsz axis 14–32, weights 300/400/500/600/700 + 400 italic).
- **Source:** Google Fonts CDN (fonts.googleapis.com / fonts.gstatic.com).
- **`font-display: swap`** — already set on the Google CSS request (`&display=swap` query
  string, see [`client/index.html`](../../client/index.html)).
- **Subset handling:** Google's CSS2 API auto-serves only the glyph subsets needed for
  the document's `lang` attribute via `unicode-range` rules; for `<html lang="es">` this
  resolves to Latin + Latin-Ext.
- **Fallback chain:** `'Inter', system-ui, -apple-system, sans-serif` (see
  [`client/src/index.css:156`](../../client/src/index.css)). If Inter blocks, the OS
  default sans-serif renders immediately — `font-display: swap` makes the swap clean.
- **DNS warm-up:** `<link rel="preconnect">` for `fonts.googleapis.com` and
  `fonts.gstatic.com` is in `<head>`.

## Why this is "good enough" for Gate 1

- Spanish UI only → Latin-Ext is the only required subset.
- The variable woff2 file Google ships is ~25 KB gz for the entire weight range — under
  the per-resource budget.
- PWA service worker (QA-7B.2) caches the gstatic woff2 with `CacheFirst` for 1 year
  via a workbox runtime caching rule, so repeat visits skip the network entirely.

## Multi-language plan (Gate 1 Epic A.3 — consent UI)

When the consent flow lands and renders Spanish + Arabic + French + Bambara per
[CLAUDE.md §3 Compliance](../../CLAUDE.md), this strategy needs to extend:

| Language | Script | Font candidate | Loading |
|---|---|---|---|
| Spanish | Latin-Ext | Inter (current) | App shell |
| French | Latin-Ext | Inter (current) | App shell |
| Bambara | Latin (extended) | Inter (current; uses combining diacritics) | App shell |
| Arabic | Arabic | Noto Sans Arabic or IBM Plex Sans Arabic | **Lazy** — only on consent-language pages |

### Lazy loading pattern

For Arabic specifically, do NOT add to the global Google Fonts URL — that would force
every visitor to download Arabic glyphs. Instead, dynamically inject when the consent
form renders:

```ts
// client/src/features/persons/utils/loadArabicFont.ts
let loaded = false;

export async function loadArabicFontIfNeeded() {
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;700&display=swap";
  document.head.appendChild(link);
  // Optionally: await document.fonts.ready before rendering Arabic-heavy UI
}
```

Call from the consent component when `selectedLanguage === "ar"`.

### Glyph budget

If Arabic-only rollouts in production show LCP regression, switch to **Google Fonts
text= API** for the consent template's exact glyph set — it caps the woff2 download to
~5 KB instead of ~30 KB:

```html
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic&text=...consent+form+glyphs..." rel="stylesheet" />
```

## Verification

- `font-display: swap` confirmed in production network tab — CSS request returns
  `font-display: swap;` rules.
- LCP test on Moto G4 (cold start, throttled 4G) target: ≤2.5s with system-ui fallback;
  Inter swaps in within 200-500 ms after.
