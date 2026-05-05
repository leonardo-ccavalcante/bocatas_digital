# `families.ts` refactor — split 1735 lines into ≤400-line files

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Split the 1735-line `server/routers/families.ts` god-file into ≤400-line cohesive units using the `mergeRouters` pattern, with **zero behavior change** and tests staying green.

**Architecture:** `families.ts` exports one `familiesRouter = router({...})` with ~25 procedures. The split creates a `server/routers/families/` directory with one sub-router per cohesive job-group (CRUD, members, documents, compliance, sessions, CSV, etc.). The new `families.ts` becomes a thin re-export of `mergeRouters(crud, members, …)`.

**Tech Stack:** tRPC v11 `router` + `mergeRouters`. No new dependencies. Existing tests at `server/__tests__/families-getbyid.test.ts` (and any others that import `families.ts`) MUST pass unchanged.

---

## Karpathy pre-flight (assumptions surfaced)

- **A1**: Splitting via `mergeRouters` preserves the `trpc.families.<procedureName>` client API. ✅ tRPC docs confirm this.
- **A2**: Helper functions (`resolveMemberPersonId`, `ensureFamiliaEnrollment`, `insertFamilyRow`, etc.) are only used inside families.ts. ⚠ Must verify with grep before extracting — if any other router imports them, the helpers move to `shared/` not `families/_shared.ts`.
- **A3**: Zod schemas (`uuidLike`, `programIdSchema`, `FamilyMemberSchema`) are defined inside families.ts and imported nowhere else. ⚠ Verify with grep.
- **A4**: All ~25 procedures use `adminProcedure` or `protectedProcedure` from `_core/trpc.ts`. Confirmed by section markers.
- **A5**: Tests don't import internal helpers, only the router shape. ⚠ Verify by grepping test files for direct imports from `families.ts`.

**Surgical rule:** behavior MUST NOT change. Every procedure body copied verbatim. No "while we're here" cleanups, no rename, no logic edits. Only file-boundary moves.

---

## Procedure inventory (current location → target file)

From the grep map of section markers + procedure definitions:

| Lines | Procedure | Target file |
|---|---|---|
| 47–137 | `resolveMemberPersonId`, `ensureFamiliaEnrollment` (helpers) | `_shared.ts` |
| 138–258 | Input schemas (`uuidLike`, `programIdSchema`, `FamilyMemberSchema`) + `insertFamilyRow` | `_shared.ts` |
| 263–313 | `getAll` | `crud.ts` |
| 316–354 | `getById` | `crud.ts` |
| 357–439 | `create` | `crud.ts` |
| 442–469 | `updateDocField` | `crud.ts` |
| 472–516 | `updateGuf`, `getGufSystemDefault`, `setGufSystemDefault` | `crud.ts` |
| 519–571 | `deactivate`, `reactivate` | `crud.ts` |
| 574–617 | `verifyIdentity` | `compliance.ts` |
| 619–813 | `getPendingItems` | `compliance.ts` |
| 816–889 | `getComplianceStats` | `compliance.ts` |
| 892–948 | `closeSession`, `getOpenSession` | `sessions.ts` |
| 951–993 | `getInformesSociales` | `compliance.ts` |
| 996–1043 | `createMemberDocument`, `getMemberDocuments` | `documents.ts` |
| 1047–1147 | `getMembers`, `addMember`, `updateMember`, `deleteMember` | `members.ts` |
| 1151–1267 | `getFamilyDocuments`, `uploadFamilyDocument`, `deleteFamilyDocument` | `documents.ts` |
| 1270–1343 | `exportFamilies` | `csv.ts` |
| 1346–1352 | `validateCSVImport` | `csv.ts` |
| 1355–1472 | `importFamilies` | `csv.ts` |
| 1475–1548 | `exportFamiliesWithMembers` | `csv.ts` |
| 1551–1557 | `validateCSVImportWithMembers` | `csv.ts` |
| 1560–1685 | `importFamiliesWithMembers` | `csv.ts` |
| 1686–1721 | `getDeliveryDocuments` | `documents.ts` |
| 1721–1735 | `uploadDeliveryDocument` | `documents.ts` |

## File structure (target)

```
server/routers/families/
├── index.ts          # mergeRouters orchestrator (~25 lines)
├── _shared.ts        # helpers + schemas + insertFamilyRow (~260 lines)
├── crud.ts           # getAll/getById/create/updateDocField/updateGuf/deactivate/reactivate (~310 lines)
├── compliance.ts     # verifyIdentity/getPendingItems/getComplianceStats/getInformesSociales (~370 lines)
├── members.ts        # getMembers/addMember/updateMember/deleteMember (~110 lines)
├── documents.ts      # member docs + family docs + delivery docs (~280 lines)
├── sessions.ts       # closeSession/getOpenSession (~60 lines)
└── csv.ts            # all 6 CSV procedures (~400 lines)
```

`server/routers/families.ts` (the original 1735-line file) is **deleted**. The barrel re-export lives at `server/routers/families/index.ts` and is imported by `server/routers/index.ts` (or wherever `appRouter` aggregates) as `families: familiesRouter` exactly as before.

---

## Tasks

### Task 0 — Pre-flight verification (TDD: GREEN baseline)

**Files:** none (read-only check).

- [ ] **Step 1:** Confirm test baseline before touching anything.

```bash
cd /Users/familiagirardicavalcante/Desktop/Bocatas_Digital/repo-followups
pnpm check 2>&1 | tail -5     # expect: only pre-existing audit-no-pii TS1501 error
pnpm test --run server/__tests__/families-getbyid.test.ts 2>&1 | tail -10
```

Expected: families test green. If red — STOP, debug per `/systematic-debugging`. Don't refactor on a broken baseline.

- [ ] **Step 2:** Verify A2/A3/A5 assumptions.

```bash
grep -rn "from.*routers/families\b\|from.*['\"]\\.\\./families\b" server/ shared/ client/src/ | grep -v node_modules
```

Expected: only `server/routers/index.ts` (or equivalent aggregator). If any other file imports from `families.ts` directly, those import paths need updating in step 9 (final import-fix).

```bash
grep -n "resolveMemberPersonId\|ensureFamiliaEnrollment\|insertFamilyRow\|FamilyMemberSchema\|programIdSchema" server/ shared/ -r --include="*.ts" | grep -v "routers/families"
```

Expected: no hits outside `families.ts`. If hits exist, those helpers must stay in `families/_shared.ts` and be exported by name; the importing file's path must update from `routers/families` to `routers/families/_shared`.

### Task 1 — Create directory + barrel `index.ts`

**Files:**
- Create: `server/routers/families/index.ts`

- [ ] **Step 1:** Create the directory.

```bash
mkdir -p server/routers/families
```

- [ ] **Step 2:** Write the orchestrator. This is the eventual final shape; for now it imports nothing yet — we'll add imports as each sub-router lands.

```ts
// server/routers/families/index.ts
import { router, mergeRouters } from "../../_core/trpc";
import { crudRouter } from "./crud";
import { membersRouter } from "./members";
import { documentsRouter } from "./documents";
import { complianceRouter } from "./compliance";
import { sessionsRouter } from "./sessions";
import { csvRouter } from "./csv";

export const familiesRouter = mergeRouters(
  router(crudRouter._def.procedures),
  // ... the rest will be re-merged once each file lands
);
```

> Don't run typecheck after this step alone — it will fail until all 6 sub-routers exist. We build the parts first, wire the orchestrator last.

### Task 2 — Extract `_shared.ts`

**Files:**
- Create: `server/routers/families/_shared.ts`

- [ ] **Step 1:** Read the current helpers + schemas section (lines 1–258 of `families.ts`).

Copy lines 1–258 verbatim into `_shared.ts`, adjusting only:
- Imports paths: `from "../_core/trpc"` → `from "../../_core/trpc"` (one extra `../`)
- Add `export` to: `uuidLike`, `programIdSchema`, `SENTINEL_UUID`, `FamilyMemberSchema`, `resolveMemberPersonId`, `ensureFamiliaEnrollment`, `insertFamilyRow`
- DROP the `// ─── Families Router ──` section and below (the actual procedures).

- [ ] **Step 2:** Verify the file compiles in isolation.

```bash
npx tsc --noEmit --skipLibCheck server/routers/families/_shared.ts 2>&1 | grep -v "Cannot find module '@" | head
```

Expected: no errors specific to `_shared.ts` (path-alias warnings about `@shared/*` are fine — those resolve via the project's tsconfig).

### Task 3 — Extract `sessions.ts` (smallest, lowest risk)

**Files:**
- Create: `server/routers/families/sessions.ts`

- [ ] **Step 1:** Write `sessions.ts` exporting `sessionsRouter`.

```ts
// server/routers/families/sessions.ts
import { z } from "zod";
import { router } from "../../_core/trpc";
import { adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../lib/supabase/server";
import { uuidLike, programIdSchema } from "./_shared";

export const sessionsRouter = router({
  closeSession: adminProcedure
    .input(z.object({
      program_id: programIdSchema,
      fecha: z.string(),
      location_id: uuidLike.optional(),
      session_data: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      // ── COPY VERBATIM from families.ts lines 892–926 ──
    }),

  getOpenSession: adminProcedure
    .input(z.object({
      program_id: programIdSchema,
      fecha: z.string().optional(),
      location_id: uuidLike.optional(),
    }))
    .query(async ({ ctx, input }) => {
      // ── COPY VERBATIM from families.ts lines 928–948 ──
    }),
});
```

- [ ] **Step 2:** Wire into orchestrator. Edit `index.ts`:

```ts
import { sessionsRouter } from "./sessions";
// add `router(sessionsRouter._def.procedures),` to mergeRouters call
```

### Task 4 — Extract `members.ts`

Same pattern: copy procedures `getMembers / addMember / updateMember / deleteMember` (lines 1047–1147) into `members.ts`. Re-import helpers from `./_shared`. Wire into orchestrator.

### Task 5 — Extract `documents.ts`

Procedures: `createMemberDocument / getMemberDocuments` (996–1043) + `getFamilyDocuments / uploadFamilyDocument / deleteFamilyDocument` (1151–1267) + `getDeliveryDocuments / uploadDeliveryDocument` (1686–1735).

Estimated total: ~280 lines. Within cap.

### Task 6 — Extract `csv.ts`

Procedures: `exportFamilies` (1270–1343), `validateCSVImport` (1346–1352), `importFamilies` (1355–1472), `exportFamiliesWithMembers` (1475–1548), `validateCSVImportWithMembers` (1551–1557), `importFamiliesWithMembers` (1560–1685).

Estimated total: ~400 lines. **At the cap.** If the file ends up over 400, split into `csv-export.ts` + `csv-import.ts`.

### Task 7 — Extract `compliance.ts`

Procedures: `verifyIdentity` (574–617), `getPendingItems` (619–813), `getComplianceStats` (816–889), `getInformesSociales` (951–993).

Estimated total: ~370 lines. Within cap.

### Task 8 — Extract `crud.ts` (largest, last)

Procedures: `getAll / getById / create / updateDocField / updateGuf / getGufSystemDefault / setGufSystemDefault / deactivate / reactivate` (lines 263–571).

Estimated total: ~310 lines. Within cap.

### Task 9 — Delete original `families.ts`, fix imports, verify

- [ ] **Step 1:** Confirm orchestrator now mergeRouters-includes all 6 sub-routers. Read `server/routers/families/index.ts`; expect 6 imports + 6 entries in `mergeRouters`.

- [ ] **Step 2:** Find what imports the old `families.ts` and update to import from `families/index.ts`. With tRPC, `import { familiesRouter } from "./families"` should resolve to `families/index.ts` automatically by Node's module resolution. Verify:

```bash
grep -rn "from.*['\"]\\./families['\"]\\|from.*['\"]\\./routers/families['\"]" server/ | grep -v node_modules
```

If anything imports it differently (e.g., `from "./families.ts"` with explicit extension), update those.

- [ ] **Step 3:** Delete the old monolith.

```bash
git rm server/routers/families.ts
```

- [ ] **Step 4:** Verify build + tests.

```bash
pnpm check 2>&1 | tail -10
pnpm test --run server/__tests__/families-getbyid.test.ts 2>&1 | tail -10
pnpm test 2>&1 | tail -5     # full suite — same pass count as Task 0 baseline
```

Both must pass with the same counts as Task 0. If any test fails — STOP. Apply `/systematic-debugging`: identify which procedure's behavior changed (a copy-paste error somewhere), fix at root cause, re-verify. Don't keep refactoring if a test is red.

- [ ] **Step 5:** Verify line counts.

```bash
wc -l server/routers/families/*.ts | sort -n
```

Every file MUST be ≤400. If any file is over, split it further before commit.

### Task 10 — Commit + PR

- [ ] **Step 1:**

```bash
git add server/routers/families/
git rm server/routers/families.ts   # already done in Task 9.3 but git status should still be clean
git status --short    # expect: 1 deletion + 8 additions (index + 7 sub-files)

git commit -m "refactor(families): split 1735-line router into 7 ≤400-line files (mergeRouters)

Zero behavior change. Verified via test baseline before + after (same pass count).
Each sub-file targets a cohesive job group:
  - _shared.ts       helpers + schemas + insertFamilyRow
  - crud.ts          getAll/getById/create/updateDocField/updateGuf/deactivate/reactivate
  - compliance.ts    verifyIdentity/getPendingItems/getComplianceStats/getInformesSociales
  - members.ts       getMembers/addMember/updateMember/deleteMember
  - documents.ts     member + family + delivery documents
  - sessions.ts      closeSession/getOpenSession
  - csv.ts           all CSV export/import procedures
  - index.ts         mergeRouters orchestrator

Closes H-5 file-size violation for families.ts.
"

git push -u origin cleanup/phase5b-files-over-150
gh pr create \\
  --title "refactor(families): split 1735-line router into 7 ≤400-line files" \\
  --body 'See plan: docs/superpowers/plans/2026-05-05-families-refactor.md'
```

---

## Verification gates (must all pass before PR)

1. `pnpm check` produces same output as Task 0 baseline (only pre-existing audit-no-pii warning).
2. `pnpm test --run server/__tests__/families-getbyid.test.ts` — green, same pass count.
3. `pnpm test` full suite — same totals as baseline (passes/skipped/failures unchanged).
4. `wc -l server/routers/families/*.ts | awk '$1 > 400'` returns nothing.
5. `grep -rn "from.*routers/families.ts\|from.*routers/families\\b" server/ | grep -v node_modules` returns clean — no broken imports.
6. `git diff --stat origin/main...HEAD` summary: 1 deletion (`families.ts`) + 8 new files.

If any gate fails, fix at the root (per `/systematic-debugging`) before continuing. Don't ship a refactor that breaks behavior.

---

## Out of scope (explicit)

- Renaming any procedure (would break client tRPC calls)
- Changing any procedure's input/output Zod schema
- Refactoring procedure bodies for clarity ("while we're here" cleanups)
- Splitting `_shared.ts` further (260 lines is under cap)
- Touching test files (tests remain unchanged)
- Other large files (`announcements.ts`, `RegistrationWizard.tsx`, etc.) — separate PRs

---

## Karpathy double-check — what NOT to do

| Tempting | Why wrong | Do this instead |
|---|---|---|
| Split `crud.ts` further by job number | Fragments cohesive CRUD logic; 310 lines is fine | Keep together; only split if over 400 |
| Rename `getById` → `findById` while at it | Breaks every tRPC client call | Don't rename. Verbatim copy. |
| Move helpers into `shared/` "for cleanliness" | Increases blast radius, complicates imports | Keep helpers in `families/_shared.ts` until A2/A3 confirm cross-router usage |
| Inline single-use schemas into procedure inputs | Loses type-export reuse | Keep `programIdSchema` exported from `_shared.ts` as today |
| Add new procedures while refactoring | Mixes refactor + feature, makes review hard | Refactor PR first, features in follow-ups |
