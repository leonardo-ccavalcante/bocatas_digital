// Fixture self-test for the docs drift gate (scripts/check-agents-docs.mjs).
// Pins the gate's catch behavior so a regression in its path heuristic or stale
// patterns cannot silently turn it into an always-green no-op.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = resolve(__dirname, "../../scripts/check-agents-docs.mjs");
const roots: string[] = [];

function makeFixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "docs-gate-"));
  roots.push(root);
  mkdirSync(join(root, "docs"), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(root, name), content);
  }
  return root;
}

function runGate(root: string) {
  const res = spawnSync("node", [SCRIPT], {
    env: { ...process.env, DOCS_CHECK_ROOT: root },
    encoding: "utf8",
  });
  return { status: res.status, out: `${res.stdout}${res.stderr}` };
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("docs drift gate", () => {
  it("passes on clean docs with resolvable path refs and an intact bridge", () => {
    const root = makeFixture({
      "README.md": "hello",
      "AGENTS.md": "See `README.md` and `docs/` for details.\n",
      "CLAUDE.md": "# CLAUDE.md\n\n@AGENTS.md\n",
      "CONTEXT.md": "Glossary. Rules live in `AGENTS.md`.\n",
    });
    const { status, out } = runGate(root);
    expect(out).toContain("docs-drift: OK");
    expect(status).toBe(0);
  });

  it("fails on a broken path reference", () => {
    const root = makeFixture({
      "AGENTS.md": "See `docs/nonexistent-file.md`.\n",
      "CLAUDE.md": "@AGENTS.md\n",
      "CONTEXT.md": "ok\n",
    });
    const { status, out } = runGate(root);
    expect(status).not.toBe(0);
    expect(out).toContain("docs/nonexistent-file.md");
  });

  it("fails on stale-state snapshot patterns", () => {
    const root = makeFixture({
      "AGENTS.md": "Current scope as of 2026-01-15: everything is done.\n",
      "CLAUDE.md": "@AGENTS.md\n",
      "CONTEXT.md": "ok\n",
    });
    const { status, out } = runGate(root);
    expect(status).not.toBe(0);
    expect(out).toContain("stale-state pattern");
  });

  it("fails when the CLAUDE.md bridge no longer imports AGENTS.md", () => {
    const root = makeFixture({
      "AGENTS.md": "rules\n",
      "CLAUDE.md": "# CLAUDE.md\n\nSome unrelated content.\n",
      "CONTEXT.md": "ok\n",
    });
    const { status, out } = runGate(root);
    expect(status).not.toBe(0);
    expect(out).toContain("bridge broken");
  });

  it("ignores non-path backtick tokens (commands, env vars, globs, refs)", () => {
    const root = makeFixture({
      "AGENTS.md":
        "Run `pnpm lint` with `NODE_ENV=test`, check `origin/main`, glob `**/*.test.ts`, route `/login`.\n",
      "CLAUDE.md": "@AGENTS.md\n",
      "CONTEXT.md": "ok\n",
    });
    const { status, out } = runGate(root);
    expect(out).toContain("docs-drift: OK");
    expect(status).toBe(0);
  });
});
