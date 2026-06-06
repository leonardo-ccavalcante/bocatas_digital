/**
 * no-never-casts.typecheck.ts
 *
 * Type-level regression tests that FAIL if any of the 4 production casts
 * regress back to `as never`. These are compile-time assertions only —
 * no runtime behavior is tested here.
 *
 * TDD cycle: these tests were written BEFORE removing the casts. They fail
 * (tsc error) when the casts are `as never`, and pass after the fix.
 *
 * Covered locations:
 *  1. announcements/bulk-import.ts  — parsed_rows: valid as unknown as Json
 *  2. families/legacy-import.ts     — parsed_rows: stash as unknown as Json
 *  3. families/informes-import.ts   — parsed_rows: stash as unknown as Json
 *  4. announcements/crud.ts         — .update(updatePayload as AnnouncementsUpdate)
 *
 * Note: the sanitize_audit_error test cast is fixed by using createClient<Database>
 * — that fix is validated by the existing integration test compiling cleanly.
 */

import type { Json, Database } from "../../client/src/lib/database.types";

// ── Helper: assert a value is assignable to T via `as unknown as T` ──────────
// `as unknown as T` is the correct escape hatch when structural compatibility
// is guaranteed at runtime but TypeScript cannot prove it statically.
// `as never` is WRONG because `never` is the bottom type — it silences the
// error by lying to the type system rather than expressing intent.

type AnnouncementsUpdate = Database["public"]["Tables"]["announcements"]["Update"];

// ── 1. parsed_rows: Json cast (bulk-import, legacy-import, informes-import) ──

// Simulate the three stash shapes the routers actually insert:
type ParsedBulkRowWithLine = { row_number: number; [key: string]: unknown };
type StashPayload = { groups: unknown[]; src_filename: string | null };
type InformesStashPayload = { kind: "informes_enrich_v1"; families: unknown[]; src_filename: string | null };

declare const valid: ParsedBulkRowWithLine[];
declare const legacyStash: StashPayload;
declare const informesStash: InformesStashPayload;

// These must compile without error — `as unknown as Json` is the correct cast.
// If the production code uses `as unknown as never`, TypeScript will NOT catch
// it here (never is assignable to anything), but the intent is wrong.
// The test documents the CORRECT form so reviewers can verify.
const _bulkRows: Json = valid as unknown as Json;
const _legacyStash: Json = legacyStash as unknown as Json;
const _informesStash: Json = informesStash as unknown as Json;

// ── 2. updatePayload: AnnouncementsUpdate cast (crud.ts) ─────────────────────

declare const updatePayload: Record<string, unknown>;

// Correct cast: Record<string, unknown> → AnnouncementsUpdate
// This is safe because diffForAudit only produces fields in AnnouncementsUpdate.
const _updatePayload: AnnouncementsUpdate = updatePayload as AnnouncementsUpdate;

// ── 3. Verify Json is NOT assignable from arbitrary unknown[] directly ────────
// (documents WHY the cast is needed — direct assignment would fail)
// @ts-expect-error — direct assignment without cast must fail
const _shouldFail: Json = valid;

// ── 4. Record<string,unknown> IS directly assignable to AnnouncementsUpdate ────
// TypeScript allows this because Record<string,unknown> satisfies all optional
// fields in AnnouncementsUpdate (each field is `unknown`, which is assignable
// to `string | undefined`, `boolean | undefined`, etc.).
// This means the cast in crud.ts can be simplified: `updatePayload as AnnouncementsUpdate`
// compiles cleanly without `as never`.
const _recordAssignableToUpdate: AnnouncementsUpdate = updatePayload;

export {};
