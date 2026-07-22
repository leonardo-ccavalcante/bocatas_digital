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

      // File-size budget per D4 of the Phase 2+3 parallel plan
      // (read-the-file-users-familiagirardicavalc-cheerful-meerkat.md).
      // 300-line cap on TS/TSX files keeps modules small enough to be
      // codemap-navigable and Feature-Agent-scoped. Skip blank lines and
      // comments so JSDoc / banner comments don't inflate the count.
      "max-lines": [
        "error",
        { max: 300, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  // Test files are exempt from max-lines — they grow naturally with test
  // scenarios and don't represent the same maintainability concern as
  // production modules.
  {
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "**/__tests__/**/*.{ts,tsx}",
    ],
    rules: {
      "max-lines": "off",
    },
  },
  // Legacy production files already exceeding 300 LOC as of micro-PR #0.
  // Downgraded to warn so existing tech debt is visible but doesn't block
  // CI. Phase 2 / Phase 3 NEW code stays under the hard 300 cap. Each
  // entry here should be split (or have its over-line portion extracted)
  // when the file is next touched.
  {
    files: [
      "client/src/components/BulkImportFamiliasLegacyModal.tsx",
      "client/src/components/BulkImportNovedadesModal.tsx",
      "client/src/components/MemberManagementModal.tsx",
      "client/src/components/layout/AppShell.tsx",
      // HojaDrawer REMOVED from the allow-list (SIS-01 resolved): split from ~893
      // lines into a drawer shell (268) + 5 self-contained components
      // (DocPreviewModal, TemplateManagementModal, SignedHojaUploadModal,
      // InterventionsList, ExcludeInterventionModal). The max-lines ERROR gate
      // now enforces it — it can't silently regrow.
      "client/src/features/persons/components/RegistrationWizard/index.tsx",
      "client/src/features/programs/components/ProgramForm.tsx",
      "client/src/pages/ProgramaDetalle.tsx",
      // Personas.tsx grew 280→478 via Manus perf work (virtualization + lazy-mount)
      // integrated in the #118 merge. Allow-listed to keep the merge surgical; the
      // over-line portion (VirtualizedDesktop/MobileList + filter hooks) should be
      // extracted in a focused follow-up where /personas perf can be verified in-app.
      "client/src/pages/Personas.tsx",
      "client/src/pages/admin/LogsPage.tsx",
      "server/csvLegacyFamiliasMapper.ts",
      "server/routers/families/compliance.ts",
      "server/routers/families/legacy-import.ts",
      "server/routers/programs.ts",
    ],
    rules: {
      "max-lines": [
        "warn",
        { max: 300, skipBlankLines: true, skipComments: true },
      ],
    },
  },
];
