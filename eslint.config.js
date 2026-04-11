import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooksPlugin from "eslint-plugin-react-hooks";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "**/*.d.ts",
      "client/src/lib/database.types.ts",
      "supabase/functions/**", // Deno — separate lint pass
      ".manus-logs/**",
      // shadcn/ui generated components (template scaffold — not our code)
      "client/src/components/ui/**",
      "client/src/components/DashboardLayout.tsx",
      "client/src/components/DashboardLayoutSkeleton.tsx",
      "client/src/components/AIChatBox.tsx",
      "client/src/components/Map.tsx",
      "client/src/components/ErrorBoundary.tsx",
      "client/src/components/ComponentShowcase.tsx",
      "client/src/pages/ComponentShowcase.tsx",
      // Server template scaffold — not our code
      "server/_core/**",
      "server/db.ts",
      "server/storage.ts",
    ],
  },
  {
    files: ["client/src/**/*.{ts,tsx}", "server/**/*.ts", "shared/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      // TypeScript
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["warn", { prefer: "type-imports" }],

      // React Hooks
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // General
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
];
