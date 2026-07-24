/**
 * Personas.maxlines.test.ts — MYT-121 (gh #121).
 *
 * Finding: Personas.tsx is 484 raw lines (>300 max-lines cap) and is
 * hard-coded into the "legacy allow-list" block in eslint.config.js
 * (added during the #118 Manus-perf merge), which downgrades its
 * max-lines violation from "error" to "warn" so it doesn't block CI.
 *
 * AGENTS.md §Code quality: "max-lines 300 per file is an ERROR; a
 * hardcoded legacy allow-list downgrades named pre-existing files to
 * warn. New files hard-fail CI at 300 — extract, don't grandfather."
 * The allow-list entry itself says this should be "extracted in a
 * focused follow-up" (eslint.config.js:104-108) — this is that follow-up.
 *
 * This test asserts BOTH halves of the fix directly, using the real
 * mechanisms (not a re-implementation of them):
 *   1. eslint.config.js's allow-list block no longer names Personas.tsx
 *      (checked by dynamically importing the real flat config and
 *      inspecting the `files` array of the entry that downgrades
 *      max-lines to "warn" — the same object ESLint itself reads).
 *   2. The real ESLint engine, run against the CURRENT config, reports
 *      zero max-lines messages (of any severity) for Personas.tsx — i.e.
 *      the file is actually under the 300-line cap (skipBlankLines +
 *      skipComments, matching the base rule's own counting), not just
 *      shielded by the allow-list.
 *
 * Both must hold: removing the allow-list entry alone without shrinking
 * the file would flip warn->error (caught by #2); shrinking the file
 * without removing the entry would leave dead tech-debt config (caught
 * by #1).
 */
import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const ESLINT_CONFIG_PATH = path.join(ROOT, "eslint.config.js");
const PERSONAS_REL = "client/src/pages/Personas.tsx";
const PERSONAS_ABS = path.join(ROOT, PERSONAS_REL);

describe("Personas.tsx must obey max-lines like any other production file (MYT-121)", () => {
  // 30s timeout: importing the real flat config pulls the whole
  // typescript-eslint plugin chain — >5s cold on this machine. The
  // assertions are unchanged; only the env budget is raised.
  it("eslint.config.js legacy allow-list no longer names Personas.tsx", { timeout: 30_000 }, async () => {
    const config = (
      (await import(pathToFileURL(ESLINT_CONFIG_PATH).href)) as {
        default: Array<{ files?: string[]; rules?: Record<string, unknown> }>;
      }
    ).default;

    const downgradeEntry = config.find(
      (entry) =>
        Array.isArray(entry.files) &&
        entry.files.includes(PERSONAS_REL) &&
        Array.isArray(entry.rules?.["max-lines"]) &&
        (entry.rules!["max-lines"] as unknown[])[0] === "warn"
    );

    expect(downgradeEntry, PERSONAS_REL + " must not be in the max-lines allow-list").toBeUndefined();
  });

  it("real ESLint reports zero max-lines messages for Personas.tsx", async () => {
    const eslint = new ESLint({ cwd: ROOT });
    const results = await eslint.lintFiles([PERSONAS_ABS]);
    const maxLinesMessages = results.flatMap((r) =>
      r.messages.filter((m) => m.ruleId === "max-lines")
    );

    if (maxLinesMessages.length > 0) {
      throw new Error(
        `Personas.tsx still trips max-lines under the real ESLint config: ` +
          maxLinesMessages
            .map((m) => `severity=${m.severity} ${m.message}`)
            .join("; ")
      );
    }
    expect(maxLinesMessages).toEqual([]);
  });
});
