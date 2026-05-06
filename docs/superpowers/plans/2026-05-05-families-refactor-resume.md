# `families.ts` refactor — resume note for post-compact session

**Branch:** `cleanup/phase5b-files-over-150` (off main, `dd5a5b4..` and one more commit `_shared.ts`)
**Plan:** [`2026-05-05-families-refactor.md`](./2026-05-05-families-refactor.md)

## State at compact

| Task | Status |
|---|---|
| Task 0 — Pre-flight baseline | ✅ done — typecheck clean (pre-existing audit-no-pii TS1501 only); test suite baseline = **80 files / 884 tests / 19 failed (env-dependent) / 839 passed / 26 skipped**. Post-refactor must match. |
| Task 0.2 — Assumption checks | ⚠️ **A2 violated** — `server/routers/persons.ts:17` imports `insertFamilyRow` AND `mirrorMembersToTable` from `./families`. The barrel `index.ts` MUST re-export these from `_shared.ts` so `persons.ts` doesn't need an import-path update. |
| Task 1 — Create `families/` directory | ✅ done |
| Task 2 — Extract `_shared.ts` | ✅ done — committed. 235 lines, exports: `uuidLike`, `SENTINEL_UUID`, `programIdSchema`, `resolveMemberPersonId`, `ensureFamiliaEnrollment`, `familyDocTypeSchema`, `FamiliesUpdate` (type), `FamilyMemberSchema`, `mapParentescoToRelacion`, `MirrorMember` (type), `mirrorMembersToTable`, `insertFamilyRow`, `DeactivateFamilyInputSchema` |
| Tasks 3–9 — Extract sub-routers + delete original | ⏳ pending |
| Task 10 — Commit + PR | ⏳ pending |

## How to resume (next session)

1. Read [`2026-05-05-families-refactor.md`](./2026-05-05-families-refactor.md) to refresh the procedure inventory + target file structure.
2. Re-verify the baseline still matches: `pnpm check` (1 audit-no-pii error) + `pnpm test` (884 tests, 19 fail, 839 pass, 26 skip).
3. Continue with **Task 3** — extract `sessions.ts` (smallest, lowest-risk first per the plan). Procedure inventory:
   - `closeSession`: lines 892–926 of `server/routers/families.ts`
   - `getOpenSession`: lines 928–948
4. Repeat Tasks 4–9 in order (members → documents → csv → compliance → crud).
5. **Critical for Task 9 (the cutover):** the new `families/index.ts` barrel must re-export `insertFamilyRow` and `mirrorMembersToTable` (and any other helpers `persons.ts` needs) so `import { insertFamilyRow } from "./families"` keeps working without touching `persons.ts`. Otherwise update `persons.ts:17` import path.
6. Apply per-task gates: `pnpm check` clean + same test counts.

## Methodology to apply on resume (per user directive)

The user requested additional rigor on the remaining work:

1. **`/sat` (Structured Analytic Techniques)** — surface assumptions per task. Already applied at the plan level (A1–A5); apply again per-extraction (e.g. "are there hidden imports of `getPendingItems` from a test file?").
2. **`/debug` (`/systematic-debugging`)** — root cause first. If a test goes red after extracting a sub-router, diff procedure body byte-by-byte against source before assuming TDD flakiness.
3. **`/test-driven-development`** — verify GREEN baseline before each Task; verify GREEN after each Task. Don't bundle multiple extractions into a single verification pass — too hard to bisect on regression.
4. **`/code-review`** — at end (Task 9.4), dispatch the `code-reviewer` agent on the diff before opening the PR. Specifically check: (a) every procedure body identical to source modulo whitespace, (b) imports complete in each new file, (c) `mergeRouters` ordering doesn't shadow procedure names.
5. **`/refactor-clean`** — only at the very end (after the PR opens). The refactor-cleaner agent should look for genuinely dead code (unused exports, unused imports the move surfaced, orphaned types). Do NOT run during the extraction — its agentic behavior could remove things that are referenced in pending sub-files.

**Reinforcement-learning framing the user mentioned:** treat each extraction as one episode. Verification gates are the reward signal. If `pnpm check` regresses, roll back THAT task only (not the whole branch), debug the root cause, retry. Don't optimize across episodes (i.e. don't try to make multiple extractions efficient by reading source once and writing many files; that bundles failure modes).

## Out of scope for this session

- Phases 5b PR-B (announcements.ts), PR-C (RegistrationWizard.tsx), PR-D (IntakeWizard.tsx), PR-E (rest of >400-line files) — separate PRs after PR-A lands.
