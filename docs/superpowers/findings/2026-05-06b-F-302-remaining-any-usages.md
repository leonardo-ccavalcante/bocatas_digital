# F-302 — Remaining `any` usages outside the `(db as any)` cluster

**Severity:** MEDIUM
**Discovered:** QA-5 sweep (2026-05-06)
**Status:** DEFERRED (per plan §4.B "F-204 rides along ONLY if trivial")

## Summary

After QA-5's spurious-cast cleanup (14 errors removed), `pnpm lint` still reports **86 `no-explicit-any` errors / 85 warnings** across the codebase. These are NOT the `(db as any)` pattern QA-5 targeted — they're a mix of:

| Pattern | Where | Approx count |
|---|---|---|
| `[key: string]: any` in interfaces | `SoftDeleteRecoveryTable.tsx`, logging types, etc. | ~12 |
| `: any` parameter annotations on event/callback handlers | client wizards, tables | ~30 |
| `(data as any).field` on dynamic JSON SDK responses | `server/_core/sdk.ts`, `server/_core/oauth.ts` | ~12 |
| `as any[]` and `as any` for RPC / dynamic-shape inserts | `server/routers/programs.ts`, `csv-import.ts` | ~10 |
| Raw `any` in test mocks (acceptable per plan) | `*.test.ts` | ~15 |
| `any` in `client/src/lib/logging-types.ts` | logging payload shapes | ~5 |

## Root cause

These predate QA-5 and have varied root causes:
- `[key: string]: any` should be `[key: string]: unknown` (F-204 pattern from W1-types).
- Parameter annotations should be inferred from generic types or replaced with concrete shapes.
- SDK response casts (`server/_core/sdk.ts`) need a Zod schema parse instead of `(data as any)?.field`.
- RPC/dynamic-insert casts (`programs.ts`, `csv-import.ts`) need `Tables<"programs">["Insert"]` type.
- Test-file `as any` is per the project's coding rules acceptable for mocks.

## Why deferred from QA-5

Plan §4.B explicitly: "F-204 (Record<string,unknown> pattern) and F-205 ... ride along ONLY if they're trivial; otherwise file as separate findings and defer." None of the remaining clusters are trivial — each requires either schema design or test-mock policy review.

## Suggested decomposition (one PR per cluster)

1. **F-302a** — `[key: string]: any` → `unknown` (1-2 hr; touches 4-5 files; needs runtime narrowing in date formatters).
2. **F-302b** — SDK response Zod parsing for `_core/sdk.ts` + `_core/oauth.ts` (2-3 hr; behavioral risk: parse failures need to be handled gracefully).
3. **F-302c** — `programs.ts` typed Insert/Update with `Tables<...>["Insert"]` (~1 hr).
4. **F-302d** — `csv-import.ts` typed family insert (~1 hr; depends on F-302c pattern).
5. **F-302e** — test-mock `as any` review: keep as project policy, suppress with file-level `eslint-disable` comment (15 min).

Estimated effort total: ~6-7 hr · Risk: low-medium · Touches: ~15 files spread.
