/**
 * Wave 4 perf invariants (Mythos ATL-01/02/06/07) — source-level guards.
 *
 * These pin CONFIG decisions whose silent reversal would regress performance
 * with green CI (the Lighthouse gate only catches them indirectly, and only
 * when they push /login over budget):
 *
 *   1. vitePluginManusRuntime stays OUT of production builds — it inlines
 *      ~366KB (own React copy) into index.html of every page, uncacheable.
 *   2. @supabase/* is NOT manual-chunked — the object form created an eager
 *      cross-chunk edge that preloaded 53KB gzip of Supabase on every page.
 *   3. QueryClient ships a global staleTime — without it, every window focus
 *      refired all visible queries (full persons dataset per focus, on 4G).
 *   4. The viewport meta never caps zoom (WCAG 1.4.4 — elderly users).
 *
 * Same source-inspection pattern as checkin.missingItems.test.ts: hermetic,
 * no build required. If you change one of these on purpose, update the
 * matching assertion AND the Wave 4 reasoning in the ledger.
 *
 * MYTHOS: ATL-01, ATL-02, ATL-06, ATL-07
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, "..", "..", rel), "utf8");

describe("Wave 4 perf invariants", () => {
  it("vite.config gates vitePluginManusRuntime behind command === 'serve'", () => {
    const src = read("vite.config.ts");
    expect(src).toMatch(
      /command === "serve" \? \[vitePluginManusRuntime\(\)\] : \[\]/
    );
  });

  it("vite.config does NOT manual-chunk @supabase packages", () => {
    const src = read("vite.config.ts");
    const manualChunks = src.slice(src.indexOf("manualChunks"));
    expect(manualChunks).not.toMatch(/"@supabase\//);
  });

  it("QueryClient has a global default staleTime", () => {
    const src = read("client/src/main.tsx");
    expect(src).toMatch(
      /new QueryClient\(\{\s*defaultOptions:\s*\{\s*queries:\s*\{\s*staleTime:\s*60_000/
    );
  });

  it("index.html viewport does not cap zoom (no maximum-scale / user-scalable=no)", () => {
    const src = read("client/index.html");
    expect(src).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/);
  });

  it("index.html has no unresolved %VITE_*% script placeholders", () => {
    const src = read("client/index.html");
    // Placeholders inside comments are fine; a real tag attribute is not.
    expect(src).not.toMatch(/src="%VITE_/);
  });

  // MYTHOS: MYT-80-ATL01
  // Regression guard, NOT a RED test: this finding (QRScanner statically
  // bundled into /checkin's initial chunk, 348KB gzip) was already fixed on
  // origin/main by 735cf77 ("perf(wave-4) ... Lighthouse gate re-armed
  // (ATL-01/02/06/07)", PR #103, 2026-06-12) — an ancestor of this branch's
  // HEAD (`git merge-base --is-ancestor 735cf77 HEAD` succeeds). Re-verified
  // at HEAD via `pnpm build`: QRScanner ships as its own chunk
  // (assets/QRScanner-*.js, 137.53KB / 49.40KB gzip) referenced only through
  // Vite's `__vite__mapDeps` dynamic-import map inside the CheckIn chunk, and
  // is absent from index.html's <link rel="modulepreload"> list. This
  // assertion pins CheckIn.tsx's `lazy()` wrapper so a future edit can't
  // silently revert to a static import (the gap wave4-perf-invariants.test.ts
  // left: it covered ATL-01/02/06/07 config invariants but never asserted
  // the QRScanner lazy-boundary itself).
  it("CheckIn.tsx lazy-loads QRScanner, not a static/eager import", () => {
    const src = read("client/src/pages/CheckIn.tsx");
    expect(src).not.toMatch(
      /^import\s*\{\s*QRScanner\s*\}\s*from\s*["']@\/features\/checkin\/components\/QRScanner["'];?/m
    );
    expect(src).toMatch(
      /const QRScanner = lazy\(\(\) =>\s*\n\s*import\("@\/features\/checkin\/components\/QRScanner"\)/
    );
  });
});
