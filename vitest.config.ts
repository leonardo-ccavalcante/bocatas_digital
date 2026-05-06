import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "shared/**/*.test.ts",
      "shared/**/*.spec.ts",
      "client/src/features/**/__tests__/*.test.ts",
      "client/src/features/**/__tests__/*.test.tsx",
      "client/src/features/**/__tests__/*.spec.ts",
      "client/src/features/**/__tests__/*.spec.tsx",
      "client/src/components/**/__tests__/*.test.ts",
      "client/src/components/**/__tests__/*.test.tsx",
      "client/src/components/**/__tests__/*.spec.ts",
      "client/src/components/**/__tests__/*.spec.tsx",
    ],
    coverage: {
      provider: "v8",
      include: ["server/**/*.ts", "client/src/features/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.spec.ts",
        "**/*.spec.tsx",
        "**/__tests__/**",
        "server/_core/sdk.ts",
      ],
      // Thresholds set to verified-current-baseline (2026-05-06) so the gate
      // catches REGRESSIONS without overstating actual coverage. Target is 80%
      // across all four; ratchet up as more tests land. See docs/execution-2026-05-06.md.
      thresholds: { lines: 25, branches: 70, functions: 40, statements: 25 },
      reporter: ["text", "lcov", "json-summary"],
    },
  },
});
