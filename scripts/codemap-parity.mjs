#!/usr/bin/env node
/**
 * Codemap parity check (D6 of the Phase 2+3 parallel plan).
 *
 * Asserts that every Phase-2/Phase-3 feature directory contains a CODEMAP.md
 * AND that every TypeScript source file inside that directory is referenced
 * in its CODEMAP.md (so the structural map cannot drift from reality).
 *
 * Feature Agents commit CODEMAP.md as their FIRST commit per worktree branch.
 * Production-code commits that add files without updating the codemap fail CI.
 *
 * Exits 0 on parity, 1 on drift. Designed to be fast (sync I/O, small N).
 *
 * Usage:
 *   node scripts/codemap-parity.mjs            # check all known feature dirs
 *   node scripts/codemap-parity.mjs <path>...  # check specific dir(s)
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");

// Feature directories that must contain CODEMAP.md. Add new entries as new
// feature dirs are introduced by Phase 2 / Phase 3 fan-out.
const REQUIRED_CODEMAP_DIRS = [
  "client/src/features/mapa-tab",
  "client/src/features/reports-tab",
  "client/src/features/derivar",
  "client/src/pages/admin/InstitucionesPage",
];

const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const IGNORED_BASENAMES = new Set(["CODEMAP.md", "index.ts", "index.tsx"]);

/** Recursively list TS/TSX source files under `dir`, skipping test layers. */
function listSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    // Tests live in a parallel layer; the codemap describes the production
    // structure, not test coverage. Skip __tests__/ subdirs entirely.
    if (entry === "__tests__" || entry === "__fixtures__") continue;
    if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) continue;
    if (entry.endsWith(".spec.ts") || entry.endsWith(".spec.tsx")) continue;

    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

/** Check parity for one feature dir. Returns array of human-readable errors. */
function checkDir(featureDir) {
  const absDir = join(REPO_ROOT, featureDir);
  const errors = [];

  if (!existsSync(absDir)) {
    // Feature dir doesn't exist yet — that's fine pre-fan-out. Skip silently.
    return errors;
  }

  const codemapPath = join(absDir, "CODEMAP.md");
  if (!existsSync(codemapPath)) {
    errors.push(`MISSING: ${relative(REPO_ROOT, codemapPath)}`);
    return errors;
  }

  const codemap = readFileSync(codemapPath, "utf8");
  const sources = listSourceFiles(absDir).map((p) => relative(absDir, p));

  for (const src of sources) {
    const basename = src.split("/").pop();
    if (IGNORED_BASENAMES.has(basename)) continue;
    // Look for the filename anywhere in the codemap (file tree, dep graph, etc.).
    if (!codemap.includes(basename)) {
      errors.push(
        `DRIFT: ${featureDir}/${src} is not referenced in CODEMAP.md`,
      );
    }
  }

  return errors;
}

const targets = process.argv.length > 2
  ? process.argv.slice(2)
  : REQUIRED_CODEMAP_DIRS;

const allErrors = targets.flatMap((dir) => checkDir(dir));

if (allErrors.length === 0) {
  console.log(`codemap-parity: OK (${targets.length} dirs checked)`);
  process.exit(0);
}

console.error("codemap-parity: FAILED");
for (const err of allErrors) console.error("  " + err);
process.exit(1);
