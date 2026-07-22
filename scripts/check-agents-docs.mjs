#!/usr/bin/env node
// scripts/check-agents-docs.mjs — docs drift gate.
// Run: node scripts/check-agents-docs.mjs   (or: pnpm docs:check)
//
// Gates (run in CI on every PR — wired into .github/workflows/ci.yml):
//   a) every backtick-quoted repo path referenced in the scanned docs exists
//   b) the CLAUDE.md bridge is intact (symlink to AGENTS.md, or contains "@AGENTS.md")
//   c) no stale-state snapshot patterns ("as of 2026-…", "actual state on …")
// Local-only, WARNING-only (auto-skipped in CI, where ../CLAUDE.md does not exist):
//   d) the untracked workspace bootstrap ../CLAUDE.md stays thin and state-free
//      (never affects the exit code — the file is outside the repo's control)
import { existsSync, lstatSync, readFileSync, readlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// DOCS_CHECK_ROOT overrides the scanned root — used by the gate's own fixture test.
const repoRoot = process.env.DOCS_CHECK_ROOT
  ? resolve(process.env.DOCS_CHECK_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_FILES = ["AGENTS.md", "CLAUDE.md", "CONTEXT.md"];
// Backtick tokens that look like paths but are pattern names, git refs, or examples.
const IGNORE_TOKENS = new Set(["schemas.ts", "schemas/", "origin/main"]);
const PATH_EXT = /\.(md|ts|tsx|js|mjs|cjs|json|ya?ml|sql|toml|sh|css|html)$/;
const STALE_PATTERNS = [
  /\bas of 20\d\d[-–]/i,
  /actual state on/i,
  /\bactual on `?main`?,? ?20\d\d/i,
];

let violations = 0;
const err = (file, line, msg) => {
  violations++;
  console.error(`::error file=${file},line=${line}::${msg}`);
};

const looksLikePath = (tok) => {
  if (IGNORE_TOKENS.has(tok)) return false;
  if (/[\s$=(<:]/.test(tok)) return false; // commands, env pairs, placeholders
  if (/^[/~]/.test(tok) || tok.startsWith("http")) return false; // abs paths, URLs, routes
  if (/[*{]/.test(tok)) return false; // globs and templates
  return tok.includes("/") || PATH_EXT.test(tok);
};

let refCount = 0;
let scanned = 0;
for (const name of SCAN_FILES) {
  const fp = join(repoRoot, name);
  if (!existsSync(fp)) {
    err(name, 1, `${name} missing from repo root`);
    continue;
  }
  scanned++;
  readFileSync(fp, "utf8")
    .split("\n")
    .forEach((text, i) => {
      for (const m of text.matchAll(/`([^`]+)`/g)) {
        const tok = m[1];
        if (!looksLikePath(tok)) continue;
        refCount++;
        if (!existsSync(join(repoRoot, tok.replace(/\/$/, "")))) {
          err(name, i + 1, `referenced path '${tok}' not found in tree`);
        }
      }
      for (const re of STALE_PATTERNS) {
        const s = text.match(re);
        if (s) err(name, i + 1, `stale-state pattern '${s[0]}' — durable rules + live pointers only`);
      }
    });
}

// (b) bridge integrity
const bridge = join(repoRoot, "CLAUDE.md");
if (existsSync(bridge)) {
  const ok = lstatSync(bridge).isSymbolicLink()
    ? readlinkSync(bridge).endsWith("AGENTS.md")
    : readFileSync(bridge, "utf8").includes("@AGENTS.md");
  if (!ok) err("CLAUDE.md", 1, "bridge broken: must be a symlink to AGENTS.md or contain '@AGENTS.md'");
}

// (d) local-only workspace bootstrap check (absent in CI checkouts).
// WARNING-only: the parent file is outside the repo and outside any PR's control,
// so it must never flip the gate's exit code — the gate stays deterministic from
// repo contents alone. The warning keeps the workspace bootstrap honest locally.
let wsWarnings = 0;
const warn = (file, line, msg) => {
  wsWarnings++;
  console.error(`::warning file=${file},line=${line}::${msg}`);
};
const wsBootstrap = join(repoRoot, "..", "CLAUDE.md");
if (existsSync(wsBootstrap)) {
  const lines = readFileSync(wsBootstrap, "utf8").split("\n");
  if (lines.length > 120) {
    warn("../CLAUDE.md", 1, `workspace bootstrap is ${lines.length} lines (max 120) — it must stay a thin pointer`);
  }
  lines.forEach((text, i) => {
    for (const re of STALE_PATTERNS) {
      const s = text.match(re);
      if (s) warn("../CLAUDE.md", i + 1, `stale-state pattern '${s[0]}' in workspace bootstrap`);
    }
  });
}

if (violations) {
  console.error(
    `\ndocs-drift: FAILED (${violations} violation${violations === 1 ? "" : "s"}).\n` +
      "Fix: update the reference, or if a token is not a path, add it to IGNORE_TOKENS in scripts/check-agents-docs.mjs.",
  );
  process.exit(1);
}
console.log(
  `docs-drift: OK (${refCount} path refs, ${scanned} files scanned` +
    (wsWarnings ? `; ${wsWarnings} workspace-bootstrap warning${wsWarnings === 1 ? "" : "s"})` : ")"),
);
