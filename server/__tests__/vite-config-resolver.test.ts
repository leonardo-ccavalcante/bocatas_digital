/**
 * vite-config-resolver.test.ts
 *
 * Regression test for the Wave-4 bug where vite.config.ts changed from
 * exporting a plain object to exporting a function (defineConfig(fn)).
 * server/_core/vite.ts must resolve either form to a plain UserConfig object
 * before spreading it into createViteServer().
 *
 * Bug: viteConfig was spread as a function reference → Vite received no config
 * → root was undefined → /src/main.tsx?v=xxx returned 404 → blank page.
 */

import { describe, it, expect } from "vitest";
import type { UserConfig } from "vite";

// ── Helper that mirrors the resolution logic in server/_core/vite.ts ─────────
function resolveViteConfig(
  configOrFn:
    | UserConfig
    | ((env: { command: "serve" | "build"; mode: string }) => UserConfig),
): UserConfig {
  return typeof configOrFn === "function"
    ? configOrFn({ command: "serve", mode: "development" })
    : configOrFn;
}

describe("resolveViteConfig", () => {
  it("returns the object as-is when given a plain UserConfig", () => {
    const config: UserConfig = { root: "/client", base: "/" };
    expect(resolveViteConfig(config)).toBe(config);
  });

  it("calls the function with serve/development env when given a defineConfig(fn) export", () => {
    const fn = (env: { command: "serve" | "build"; mode: string }): UserConfig => ({
      root: env.command === "serve" ? "/client-dev" : "/client-prod",
    });
    const result = resolveViteConfig(fn);
    expect(result.root).toBe("/client-dev");
  });

  it("does NOT call the function with build/production env (dev server always uses serve)", () => {
    const fn = (env: { command: "serve" | "build"; mode: string }): UserConfig => ({
      root: env.command === "build" ? "/wrong" : "/correct",
    });
    expect(resolveViteConfig(fn).root).toBe("/correct");
  });

  it("spreading a function produces an empty object (demonstrates the pre-fix bug)", () => {
    const fn = (_env: { command: "serve" | "build"; mode: string }): UserConfig => ({
      root: "/client",
    });
    // Spreading a function gives {} — root is undefined, which was the bug
    const broken = { ...fn } as UserConfig;
    expect(broken.root).toBeUndefined();
  });

  it("spreading the resolved config preserves the root (demonstrates the fix works)", () => {
    const fn = (_env: { command: "serve" | "build"; mode: string }): UserConfig => ({
      root: "/home/ubuntu/bocatas-digital/client",
    });
    const resolved = resolveViteConfig(fn);
    const spread = { ...resolved };
    expect(spread.root).toBe("/home/ubuntu/bocatas-digital/client");
  });
});
