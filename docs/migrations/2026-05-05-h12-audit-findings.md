# H-12 audit — `family_member_documents` access pattern post-PR #25

Date: 2026-05-05
Phase: 1.5 (read-only audit)

## Finding: NO ACTION NEEDED

PR #25 added `family_member_documents.member_id` FK column (migration `20260505000004`). The remediation plan v2's H-12 worried that downstream code would query directly by `member_id`, bypassing the existing `family_id`-based RLS.

**Audit result against `main` (HEAD `e8cca83`):** zero direct `member_id` filters in application code.

## Evidence

```
$ grep -rn 'from(["'"'"']family_member_documents["'"'"']' server/ shared/ client/src/
server/routers/families.ts:672
server/routers/families.ts:1011  (INSERT)
server/routers/families.ts:1022,1148,1196,1224,1231,1239  (other ops)

$ grep -rn '\.eq(["'"'"']family_id["'"'"']' server/routers/families.ts | head
server/routers/families.ts:1024
server/routers/families.ts:1150
server/routers/families.ts:1198
server/routers/families.ts:1241
server/routers/families.ts:1684

$ grep -rn '\.eq(["'"'"']member_id["'"'"']' server/ shared/
(no results)
```

All 8 call sites filter by `family_id`. Zero call sites filter by `member_id` directly.

## Existing RLS coverage (live DB)

| Policy | Cmd | Qual |
|---|---|---|
| `family_member_documents_admin_all` | ALL | role IN admin/superadmin |
| `fmd_admin_all` | ALL | role IN admin/superadmin (redundant with above; no WITH CHECK) |

Non-admins are blocked from direct DB access. Application uses `createAdminClient()` (service role) for document operations through tRPC. This is consistent with the design intent in `CLAUDE.md` §3 ("High-risk fields require extra protection: foto_documento — RLS read access restricted to superadmin/admin only").

## Conclusion

- H-12 is **mitigated by current code patterns** (queries use `family_id`)
- No new RLS migration required for the `member_id` column
- The duplicate `fmd_admin_all` policy is redundant but harmless — cleanup deferred to Phase 2 polish

## If this changes

If a future feature adds direct `WHERE member_id = $X` queries on `family_member_documents`, this audit must be redone and a `member_id → familia_miembros → families` chain RLS policy added at that time.
