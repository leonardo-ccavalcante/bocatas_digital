/**
 * import-notion-formacion.ts — Notion ficha export → Formación program tree.
 *
 * Usage: tsx scripts/import-notion-formacion.ts --dir <folder> [--apply] [--out report.json]
 *
 * Dry-run is the DEFAULT (zero writes). --apply requires CONFIRM_IMPORT=yes
 * (AGENTS.md forbids auto-importing legacy data).
 *
 * Thin shim: all logic lives in server/import/cli.ts, which is covered by
 * tsc + ESLint + Vitest. This file deliberately contains no TypeScript-only
 * syntax so the repo-wide ESLint invocation can parse it.
 */
import "dotenv/config";
import { runCli } from "../server/import/cli";

runCli(process.argv.slice(2));
