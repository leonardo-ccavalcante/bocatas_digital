# F-301 — `(db as any)` cast in `soft-delete-recovery.ts` masks UI type misalignment

**Severity:** MEDIUM
**Discovered:** QA-5 cast-removal sweep (2026-05-06)
**Status:** DEFERRED (not bundled into QA-5)

## Symptom

Removing the `(db as any)` cast at `server/routers/admin/soft-delete-recovery.ts:93` causes downstream type errors:

```
client/src/pages/AdminSoftDeleteRecovery.tsx(146,17):
  Type '{ id: string; nombre: string; deleted_at: string | null; ... }[]'
  is not assignable to type 'DeletedRecord[]'.
    Types of property 'deleted_at' are incompatible.
      Type 'string | null' is not assignable to type 'string'.
```

## Root cause

`client/src/components/SoftDeleteRecoveryTable.tsx:15` declares:

```ts
interface DeletedRecord {
  id: string;
  deleted_at: string;            // ← BUG: actual DB column is `string | null`
  updated_at: string;
  [key: string]: any;            // ← also: should be `unknown`
}
```

The DB schema has `deleted_at TIMESTAMPTZ NULL` for both `families` and `persons`. The runtime filter `.not("deleted_at", "is", null)` ensures only non-null rows return, but TypeScript can't infer that from the chained query. Two fixes possible:

1. Update `DeletedRecord.deleted_at` to `string | null` and either narrow at the call site or accept null in formatting helpers (`format()` calls in the Table component).
2. Apply a runtime guard `.filter((row): row is DeletedRecord & { deleted_at: string } => row.deleted_at !== null)` in the router and keep the UI type tight.

## Why deferred from QA-5

Per plan §4.A: "if a deletion uncovers a deeper bug, STOP, file new finding, do NOT bundle." QA-5's scope is dropping spurious casts, not fixing UI date-formatting helpers.

## Suggested follow-up

A standalone PR that:
- replaces `createClient(...)` with `createAdminClient()` in `soft-delete-recovery.ts` (5 sites)
- drops the cast on line 93
- updates `DeletedRecord` to `string | null` and adjusts call sites in `SoftDeleteRecoveryTable.tsx` (date formatters need null handling)
- replaces `[key: string]: any` with `[key: string]: unknown`

Estimated effort: ~30 min · Risk: low-medium · Touches: 2 files server, 2 files client.
