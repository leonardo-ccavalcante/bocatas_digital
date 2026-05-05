# Phase 5b — Refactor remaining files >400 lines (Codex-reviewable plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (or `superpowers:subagent-driven-development` if subagents are available) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **For human/Codex review:** This plan is self-contained. Read it cold and you should be able to execute or critique without reference to prior session history.

**Goal:** Bring every application source file at `/Users/familiagirardicavalcante/Desktop/Bocatas_Digital/repo-followups/{server,client/src,shared}/**.ts(x)` under the **400-line cap** (matches the project's own `~/.claude/rules/common/coding-style.md` which says "200-400 typical, 800 max"), with **zero behavior change** and the existing test suite holding the pre-refactor baseline of `19 failed (env-dependent) | 839 passed | 26 skipped | 884 total`.

**Architecture:** Three decomposition patterns are in play depending on file shape:
1. **tRPC `mergeRouters`** for routers (already proven on `families.ts` in PR #33).
2. **React step-component split** for wizards (preserves the wizard shell, extracts each step into a co-located component file).
3. **Reusable `.ts` modules** for **genuine cross-call-site duplication** — see the *Reusable-class principle* section below.

**Tech Stack:** TypeScript strict + tRPC v11 + React 19 + Vite 7 + Zod 3 + Vitest (unchanged).

**Status entering this plan:**
- PR #33 already shipped: `families.ts` 1735 → 9 files, max 356 lines, TDD-verified parity.
- 11 application files + 4 test files remain over 400 lines (full survey in §3).

---

## 1. Reusable-class principle (per user directive — non-negotiable)

> *"Use `.ts` that could be reused as a class for more than one case, without the need to overengineer."*

**Decision rule applied per extraction:**

| Question | If YES → | If NO → |
|---|---|---|
| Is the same logic duplicated in 2+ files? | Extract to a reusable `.ts` module (class or named-export functions) | Don't extract — keep inline |
| Will the extracted module have ≥2 import sites at the time of this refactor? | Extract | Don't extract |
| Could a hypothetical 2nd consumer arrive in the next 90 days? | DON'T extract on speculation | — |
| Does extracting reduce total lines without making the diff harder to review? | Extract | Don't extract |

**Three-similar-lines-is-better-than-an-abstraction** (from `~/.claude/rules/common/coding-style.md` and `/karpathy-guidelines`). If the only justification for a class is "future modules might use it", **leave it inline**. Reuse must be present *today*.

**Naming convention:** Reusable modules get plural-or-suffixed names that tell the reader they're shared:
- `server/lib/csvCodec.ts` — not `families/csv-codec.ts` (folder placement signals reuse scope)
- `client/src/components/wizard/WizardLayout.tsx` — not `features/persons/components/RegistrationWizardLayout.tsx`

---

## 2. Required skills

Each skill maps to a concrete action in this plan. Codex reviewers can verify the methodology by checking each section.

| Skill | Where applied in the plan | What it produces |
|---|---|---|
| `/writing-plans` | This document | Bite-sized steps, exact code, exact paths, no placeholders |
| `/karpathy-guidelines` | §1 reusable-class principle, §4.x "do not extract" call-outs | Prevents speculative abstraction; surfaces every assumption |
| `/sat` (Structured Analytic Techniques) | §4.x "Pre-flight assumptions" per file | Catches hidden imports / cross-router consumers BEFORE moving code |
| `/systematic-debugging` | §6 verification gates + per-task fix-on-red protocol | Forces root-cause investigation if a TDD gate goes red — no symptom patches |
| `/test-driven-development` | §6 verification gates | GREEN baseline before each task; same pass count after each task |
| `/code-review` | §6 last gate per PR (self-review checklist) | Catches procedure-name collisions, missing imports, line-count violations |
| `/refactor-clean` | §7 only AFTER each PR merges | Finds dead code surfaced by the move (orphan exports, unused imports). **Do not run during extraction** — its agentic deletes can clip files still consumed by a pending sub-file in the same PR |
| `/executing-plans` | Whoever runs this plan | Loads it, marks tasks `in_progress` / `completed`, halts on blocker |
| `/dispatching-parallel-agents` (optional) | §6 — only for pre-flight read-only audits across multiple files | Each large-file pre-flight is independent; a single agent per file is safe to parallelize |
| `/subagent-driven-development` (optional, if available) | Per-PR execution if running in a subagent-supporting harness | Two-stage review per task: spec compliance, then code quality |

**Reinforcement-learning framing (per user directive):** treat each file's refactor as one episode. Verification gates are the reward signal. If `pnpm check` regresses on a sub-task, **roll back THAT task only** (not the whole PR), debug the root cause, retry. Don't optimize across episodes (don't try to make multiple extractions efficient by reading source once and writing many files; that bundles failure modes).

---

## 3. File survey (≥400 lines, application code)

| Rank | File | Lines | Pattern | PR |
|---|---|---|---|---|
| ~~1~~ | ~~`server/routers/families.ts`~~ | ~~1735~~ | ~~mergeRouters~~ | ~~#33 ✅ done~~ |
| 2 | `server/routers/announcements.ts` | 1241 | mergeRouters | PR-B |
| 3 | `client/src/features/persons/components/RegistrationWizard.tsx` | 1202 | step-component split | PR-C |
| 4 | `server/routers/persons.ts` | 606 | mergeRouters | PR-D |
| 5 | `client/src/features/families/components/IntakeWizard.tsx` | 602 | step-component split (already partially done in earlier work) | PR-D |
| 6 | `client/src/pages/FamiliaDetalle.tsx` | 580 | section-component split | PR-E |
| 7 | `client/src/features/persons/schemas.ts` | 549 | Zod schema split (by domain) | PR-E |
| 8 | `client/src/components/DeliveryDocumentUpload.tsx` | 536 | extract photo-capture util to reusable module | PR-F |
| 9 | `server/ocrDeliveryExtraction.ts` | 514 | extract LLM-call util to reusable module | PR-F |
| 10 | `server/routers/entregas.ts` | 485 | mergeRouters | PR-D |
| 11 | `client/src/pages/AdminNovedades.tsx` | 422 | section-component split | PR-E |
| 12 | `server/announcements-helpers.ts` | 413 | function-group split (already library-shaped) | PR-B (companion) |

Test files >400 (deferred to a separate PR — lower priority, no behavior risk):
- `server/persons.test.ts` 489 / `server/ocrDeliveryExtraction.test.ts` 478 / `server/dashboard.test.ts` 391 / `server/checkin.test.ts` 354 — split in PR-G after the application-code work lands.

Vendor / generated (skip — out of scope):
- `client/src/lib/database.types.ts` 2164 (generated by `supabase gen types`)
- `client/src/components/ui/sidebar.tsx` 734, `chart.tsx` 355, `menubar.tsx` 274, `dropdown-menu.tsx` 255 (shadcn copies — deliberately kept verbatim per shadcn philosophy)

---

## 4. Per-PR plan

Each PR follows the **same outer template**:
1. Branch off latest `origin/main`.
2. Pre-flight: `pnpm check` + `pnpm test` baseline; `grep -rn` for cross-file imports of anything we're extracting.
3. SAT assumption check (per-file).
4. Decompose using the file's pattern (mergeRouters / step-split / section-split / module-extract).
5. Apply the **reusable-class principle from §1** — extract only when 2+ call sites exist today.
6. Verify: `pnpm check` clean (only pre-existing audit-no-pii TS1501) + `pnpm test` same counts as baseline + every new file ≤400 lines.
7. Commit + push + open PR.

The differences are which file, which decomposition pattern, and which (if any) reusable module gets created. Each section below specifies all three.

---

### 4.B PR-B — `server/routers/announcements.ts` (1241 lines) + `announcements-helpers.ts` (413)

**Pattern:** `mergeRouters` (proven on families.ts).

**Pre-flight assumptions to verify:**
- A1: Is anything outside `server/routers/announcements.ts` importing helpers/schemas FROM that file (not from `announcements-helpers.ts`)?
  ```bash
  grep -rn "from.*['\"][\\.\\./]*routers/announcements['\"]\\|from.*['\"]\\./announcements['\"]" server/ shared/ client/src/ | grep -v node_modules
  ```
  Expected: only `server/routers.ts` aggregator. If anything else imports, the barrel `announcements/index.ts` MUST re-export those names.
- A2: `announcements-helpers.ts` is already imported by tests (`server/__tests__/announcement*.test.ts` × 5). Verify those imports still work after split.

**Procedure inventory** (run `grep -nE "^  [a-zA-Z_]*: (adminProcedure|protectedProcedure|publicProcedure)" server/routers/announcements.ts` — expect ~20 procedures grouped by domain):
- *list/detail*: `getActive`, `getById`, `list`, `markVisto`, `dismiss`
- *crud (admin)*: `create`, `update`, `archive`, `restore`, `setFijado`
- *audiences*: `setAudiences`, `getAudiences`
- *audit*: `getAuditLog`
- *bulk import*: `previewBulkImport`, `confirmBulkImport`, `cancelBulkImport`
- *webhooks*: `getWebhookLogs`

**Target structure:**
```
server/routers/announcements/
├── index.ts          (~40 lines)  barrel: re-exports + mergeRouters
├── _shared.ts        (~80 lines)  shared schemas (audienceRuleSchema, tipoSchema, …) + helpers used in 2+ sub-files
├── crud.ts           (~280)       create/update/archive/restore/setFijado
├── reads.ts          (~250)       getActive/getById/list/markVisto/dismiss
├── audiences.ts      (~150)       setAudiences/getAudiences
├── audit.ts          (~120)       getAuditLog
├── bulk-import.ts    (~340)       previewBulkImport/confirmBulkImport/cancelBulkImport (largest — has the 10k cap + parsed_rows logic)
└── webhooks.ts       (~80)        getWebhookLogs
```

**Reusable-class candidates (apply §1 rule):**
- ❌ DON'T extract a `AnnouncementValidator` class — used by announcements only.
- ❌ DON'T extract `parseAudienciasDSL` — already in `announcements-helpers.ts`, leave there.
- ✅ DO consider: if `validateBulkRow` (in `announcements-helpers.ts`) shares ≥3 rows of code with `validateFamiliesCSV` (`server/csvImport.ts`), extract a tiny `server/lib/csvRowValidator.ts`. Otherwise leave inline. **Verify before extracting.**

**`announcements-helpers.ts` (413 lines) split:** It's already library-shaped, but over the cap. Use the function clusters already present:
```
server/announcements/
├── helpers/visibility.ts   (~120)  isVisibleToUser + tests
├── helpers/audit.ts        (~100)  diffForAudit
├── helpers/webhook.ts      (~60)   shouldFireWebhook
├── helpers/dsl.ts          (~80)   parseAudienciasDSL
└── helpers/bulkRow.ts      (~80)   validateBulkRow
```
Keep `announcements-helpers.ts` as a barrel re-exporting all of the above so existing test imports continue to resolve.

**Tasks:**
- [ ] **B.1** — Run pre-flight (typecheck + test baseline).
- [ ] **B.2** — `grep`-verify A1 + A2.
- [ ] **B.3** — Create `server/announcements/helpers/{visibility,audit,webhook,dsl,bulkRow}.ts` from current `announcements-helpers.ts`. Replace `announcements-helpers.ts` with a barrel.
- [ ] **B.4** — Verify: `pnpm check` clean + `pnpm test --run server/__tests__/announcement*.test.ts` green (same count). If red — STOP, debug per `/systematic-debugging`.
- [ ] **B.5** — Create `server/routers/announcements/{index,_shared,crud,reads,audiences,audit,bulk-import,webhooks}.ts`. Verbatim procedure-body copies, only file-boundary moves.
- [ ] **B.6** — Delete `server/routers/announcements.ts`.
- [ ] **B.7** — `pnpm check` + `pnpm test` same counts as B.1 baseline.
- [ ] **B.8** — Commit + push + PR.

---

### 4.C PR-C — `client/src/features/persons/components/RegistrationWizard.tsx` (1202 lines)

**Pattern:** Step-component split + reusable `WizardLayout` if step-shell duplication exists with `IntakeWizard`.

**Pre-flight (SAT):**
- C1: Does `RegistrationWizard.tsx` import any local helpers? Grep + list them.
- C2: Does `IntakeWizard.tsx` (PR-D) share any step-shell pattern (header, progress dots, prev/next buttons)? If YES → extract `<WizardLayout>` to `client/src/components/wizard/WizardLayout.tsx`. If NO → split RegistrationWizard inline only.

**Likely target structure** (verify the steps in the source first):
```
client/src/features/persons/components/RegistrationWizard/
├── index.tsx                  (~120)  main wizard shell + step state machine
├── Step1Personal.tsx          (~180)
├── Step2FamilyContext.tsx     (~150)
├── Step3DocumentCapture.tsx   (~250)  reuses DocumentCaptureInline
├── Step4Consents.tsx          (~200)  reuses MemberConsentCollector
├── Step5DietaryAndExtras.tsx  (~150)
└── Step6Review.tsx            (~120)
```

**Reusable-class candidates:**
- ✅ **DO** extract `client/src/components/wizard/WizardLayout.tsx` — if both `RegistrationWizard` and `IntakeWizard` have a step-shell with progress indicators + prev/next buttons. Verify by diffing the JSX before extracting. (Today: 2 call sites = qualifies under §1.)
- ❌ **DON'T** extract `client/src/features/persons/components/RegistrationWizard/_useWizardState.ts` as a "generic wizard state hook" unless `IntakeWizard` uses the same shape today. If only RegistrationWizard uses it, keep inline.

**Tasks:** B-style (pre-flight → split → verify → commit). Plus the cross-cutting WizardLayout extraction in its own commit at the end of the PR if both wizards qualify.

---

### 4.D PR-D — `server/routers/persons.ts` (606) + `server/routers/entregas.ts` (485) + `client/.../IntakeWizard.tsx` (602)

Bundled because they're each individually small enough that splitting them in isolation would be pure overhead (more PRs, more reviews).

**`persons.ts` 606 → mergeRouters:**
```
server/routers/persons/
├── index.ts        (~30)  barrel + mergeRouters
├── _shared.ts      (~80)  schemas + helpers
├── crud.ts         (~200) create / update / getById
├── search.ts       (~120) search / findByDocument / nearbyDuplicates
├── enroll.ts       (~150) enroll + helpers — note: imports `mirrorMembersToTable` and `insertFamilyRow` from `./families` (the barrel from PR #33). VERIFY this still resolves.
└── photo.ts        (~80)  uploadPhoto procedure
```

**`entregas.ts` 485 → mergeRouters:**
```
server/routers/entregas/
├── index.ts     (~30)
├── _shared.ts   (~60)
├── crud.ts      (~220)
└── csv.ts       (~180)
```

**`IntakeWizard.tsx` 602 → step-component split** (mirrors PR-C; if `WizardLayout` is extracted, this is the second consumer that justifies it).

**Reusable-class candidates:**
- ❌ Don't extract anything from `entregas.ts` — single-domain logic.
- ⚠ Consider: if both `persons.ts` and `families.ts` have a fuzzy-name-search helper that ≥3 rows overlap, extract `server/lib/personSearch.ts`. Verify diff first.

---

### 4.E PR-E — `FamiliaDetalle.tsx` (580) + `AdminNovedades.tsx` (422) + `persons/schemas.ts` (549)

**`FamiliaDetalle.tsx` 580 → section-component split:**
```
client/src/pages/FamiliaDetalle/
├── index.tsx                   (~80)  page shell + tab/section state
├── HeaderSection.tsx           (~100)
├── MembersSection.tsx          (~150)
├── DocumentsSection.tsx        (~180)
└── ComplianceSection.tsx       (~80)
```

**`AdminNovedades.tsx` 422 → similar pattern.**

**`persons/schemas.ts` 549 — Zod schema split by domain:**
```
client/src/features/persons/schemas/
├── index.ts                (~10)  barrel re-export so existing `from "../schemas"` imports keep working
├── personalInfo.ts         (~120) PersonalInfoSchema
├── contactInfo.ts          (~80)  ContactInfoSchema
├── documentInfo.ts         (~100) DocumentInfoSchema
├── socialContext.ts        (~120) SocialContextSchema
└── registration.ts         (~120) RegistrationSchema (composes the above via .merge)
```

**Reusable-class candidates:**
- ❌ Don't extract section components into `client/src/components/sections/` "for reuse" — they're page-specific.
- ✅ Re-exporting via the schemas barrel index.ts is mandatory (preserves existing import paths).

---

### 4.F PR-F — `DeliveryDocumentUpload.tsx` (536) + `ocrDeliveryExtraction.ts` (514)

**These two files have the highest reusable-class potential.**

**`DeliveryDocumentUpload.tsx` 536:** has photo capture + camera + upload + preview logic. Inspect for overlap with:
- `client/src/components/PhotoUploadInput.tsx` (264)
- `client/src/features/programs/components/DocumentPhotoCapture.tsx` (282)
- `client/src/features/persons/components/DocumentCaptureInline.tsx` (260)

If 2+ of these duplicate camera/preview/upload logic, **extract `client/src/lib/photoCapture.ts`** (a class or hook):
```ts
// client/src/lib/photoCapture.ts — single source for camera + capture + preview
export class PhotoCaptureController {
  // start/stop camera, capture frame, return base64
}
export function usePhotoCapture(opts: PhotoCaptureOptions) { /* hook wrapping the class */ }
```

**`ocrDeliveryExtraction.ts` 514:** has LLM-call + JSON-parse + retry logic. Inspect for overlap with:
- `server/_core/llm.ts` (332)
- `server/_core/voiceTranscription.ts` (284)

If LLM-call + retry is duplicated, extract `server/lib/llmExtractor.ts`:
```ts
// server/lib/llmExtractor.ts
export class LLMExtractor<TInput, TOutput> {
  constructor(private prompt: string, private schema: ZodSchema<TOutput>) {}
  async extract(input: TInput): Promise<TOutput> { /* call + parse + retry */ }
}
```

**Apply the §1 rule strictly:** measure overlap with `git diff --no-index` or `wc -l` of the candidate region. If <10 truly-duplicated lines, leave inline.

---

### 4.G PR-G (deferred) — Test file splits

Test files don't affect runtime. Defer until application code is fully under cap. When tackled, follow the same module split pattern as the source files they test.

---

## 5. Reusable modules to introduce (final list, conditional)

Listed only if the §1 verification confirms ≥2 call sites today. Codex reviewers should check each `if-confirmed` line.

| Candidate | Path | Consumers (must be ≥2 today) | Status |
|---|---|---|---|
| `WizardLayout` | `client/src/components/wizard/WizardLayout.tsx` | `RegistrationWizard`, `IntakeWizard` | If both share the shell |
| `photoCapture` | `client/src/lib/photoCapture.ts` | ≥2 of: `DeliveryDocumentUpload`, `PhotoUploadInput`, `DocumentPhotoCapture`, `DocumentCaptureInline` | If 2+ have the same camera/preview logic |
| `llmExtractor` | `server/lib/llmExtractor.ts` | ≥2 of: `ocrDeliveryExtraction`, `_core/llm`, `_core/voiceTranscription` | If 2+ have the same call+retry pattern |
| `personSearch` | `server/lib/personSearch.ts` | `persons.search`, `families.verifyIdentity` | If both have fuzzy-name match |
| `csvRowValidator` | `server/lib/csvRowValidator.ts` | `announcements/bulk-import`, `families/csv-import` | If both have row-shape validation |

**Karpathy lock:** if a candidate fails its consumer test, **DO NOT EXTRACT**. Codex reviewers should flag any extraction whose consumers list has only 1 entry.

---

## 6. Verification gates (must all pass per PR before merge)

| # | Gate | Command | Pass criterion |
|---|---|---|---|
| 1 | TDD baseline preserved | `pnpm check` | only the pre-existing `audit-no-pii.test.ts:47` TS1501 (no new errors) |
| 2 | TDD test counts preserved | `pnpm test 2>&1 \| tail -5` | `19 failed \| 839 passed \| 26 skipped (884)` exactly |
| 3 | Line-count compliance | `find <changed-dir> -name "*.ts" -o -name "*.tsx" \| xargs wc -l \| awk '$1 > 400'` | empty output |
| 4 | Self-review: zero procedure-name collisions across mergeRouters sub-files | manual grep | every name unique |
| 5 | Self-review: imports complete | manual grep for `^import` per new file | every file imports `z`, `TRPCError` (if used), `router`/procedures, `_shared` (if applicable) |
| 6 | Reusable-class verified by ≥2 consumers | grep call sites of each new module | every extraction has ≥2 import sites |
| 7 | Cross-router imports preserved | `grep` for any other router importing from the changed router | barrel `index.ts` re-exports those names |

If any gate fails: STOP. Apply `/systematic-debugging` Phase 1 (root cause). Don't ship a refactor that breaks behavior. Don't bundle a fix into a "while I'm here" cleanup — separate commit.

---

## 7. PR sequencing

| PR | Files | Est. effort | Risk |
|---|---|---|---|
| #33 ✅ | families.ts (1735) | shipped | medium (most-tested router) |
| PR-B | announcements.ts (1241) + announcements-helpers.ts (413) | 1 session | medium (lots of tests) |
| PR-C | RegistrationWizard.tsx (1202) | 1 session | medium-high (complex stepful UI) |
| PR-D | persons.ts (606) + entregas.ts (485) + IntakeWizard.tsx (602) | 1 session | medium |
| PR-E | FamiliaDetalle.tsx (580) + AdminNovedades.tsx (422) + persons/schemas.ts (549) | 1 session | low |
| PR-F | DeliveryDocumentUpload.tsx (536) + ocrDeliveryExtraction.ts (514) + reusable-class extractions if confirmed | 1 session | low-medium (depends on whether reusable modules extracted) |
| PR-G | Test files >400 (deferred) | 0.5 session | low (no runtime risk) |

Each PR is independent and can be reviewed in isolation. They can land in any order — the only ordering constraint is that PR-C and PR-D both touch wizards, so if `WizardLayout` is extracted in PR-C, PR-D's `IntakeWizard` consumes it. Otherwise no inter-PR dependencies.

After each PR merges, run `/refactor-clean` (per §2) to find dead code surfaced by the move.

---

## 8. Out of scope

- **Behavior changes**, however minor. Cleanup, rename, "while we're here" tweaks belong in separate PRs.
- **Test file splits** — deferred to PR-G after application code is under cap.
- **Vendor / generated files**: `database.types.ts` (generated), shadcn UI components (vendor copies).
- **Performance optimization**, even if a slow query is staring at us during the move. Note in the PR body, fix in a follow-up.
- **Docs updates** to README/CLAUDE.md describing the new structure — defer to a single docs PR after all PR-B..F land. Premature docs go stale.

---

## 9. Codex evaluation rubric

A reviewer using this plan should verify:

- ✅ **Each file > 400 lines is addressed** by exactly one PR (no duplication, no gaps).
- ✅ **Each reusable-class extraction is justified by ≥2 consumers TODAY**, listed in §5. Speculative extractions are flagged for removal.
- ✅ **Methodology mapping is concrete** in §2 — each skill has a specific section it informs, not just a name-drop.
- ✅ **Verification gates in §6 are mechanical** — runnable commands with pass criteria, not subjective judgment calls.
- ✅ **Pre-flight assumptions per file (SAT)** are explicit and verifiable, not implicit. Cross-file imports are the #1 source of regression in this kind of refactor; §4.x calls them out per file.
- ✅ **Surgical rule**: every PR commit message says "verbatim procedure-body copies, only file-boundary moves, zero behavior change". Any deviation from this is a regression risk.
- ✅ **Karpathy double-check:** if any extraction would create a new file with only one import site at merge-time, that extraction must be removed from the PR. Reviewer flags it.

Likely friction points reviewer should call out:
- **§4.F LLM extractor / photo capture** — these are the most subjective extractions. If the duplicated lines count is ambiguous, default to NOT extracting (reusable-class principle is conservative).
- **Wizard layout extraction** — verify the step-shell is genuinely identical between `RegistrationWizard` and `IntakeWizard`. If they diverged in earlier work, two separate `<WizardLayout>` flavors are NOT a reuse — keep inline.
- **PR-D bundling 3 files** — risks a hard-to-review diff. If the 3 files together exceed ~600 net new lines, split PR-D into D1 (persons + entregas) and D2 (IntakeWizard).

---

## 10. How to start (new session)

```bash
cd /Users/familiagirardicavalcante/Desktop/Bocatas_Digital/repo-followups
git fetch origin
git checkout -b cleanup/phase5b-pr-b origin/main   # for PR-B; adjust per PR
pnpm install
pnpm check 2>&1 | tail -5      # capture baseline
pnpm test 2>&1 | tail -5       # capture baseline counts

# Then read this plan + the prior PR #33 for the proven mergeRouters pattern:
#   docs/superpowers/plans/2026-05-05-families-refactor.md
#   docs/superpowers/plans/2026-05-05-families-refactor-resume.md
```

Pick a PR letter (B / C / D / E / F), execute its task list under §4.x, run §6 gates, ship.

**Reviewer:** if anything in this plan is unclear or unverifiable, surface it before execution. The cost of clarifying upfront is far smaller than the cost of unwinding a bad refactor.
