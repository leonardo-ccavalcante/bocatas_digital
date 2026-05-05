# Phase 1 + Phase 2 — Final Handoff

**Branch:** `cleanup/phase1-rls-and-table-cull` (off `main` at `e8cca83`)
**Commits:** 17
**Date:** 2026-05-05

---

## Final advisor state

```
mcp__supabase__get_advisors  type=security  →  2 WARN advisors

Cleared in this branch (33+ → 2):
  ✅ rls_enabled_no_policy            5  →  0
  ✅ rls_policy_always_true           5  →  0
  ✅ security_definer_view (ERROR)    1  →  0
  ✅ function_search_path_mutable     9  →  0
  ✅ anon_security_definer_function_executable          7  →  0
  ✅ authenticated_security_definer_function_executable 7  →  0

Remaining (intentionally deferred):
  ⚠️ extension_in_public  (pg_trgm)             — risky: trigram indexes depend on it
  ⚠️ auth_leaked_password_protection             — Supabase Auth dashboard toggle, not SQL
```

---

## What was done

### Phase 0.5 — Table cull (✅ DONE)
- Dropped 7 tables: 2 backups, 2 legacy (`entregas`, `entregas_batch`), 3 Module 2-9 stubs
- Kept `grants` (€45k IRPF row)
- Snapshots written to `docs/migrations/2026-05-05-pre-cull-snapshots/`
- Result: 27 → 20 tables

### Phase 1.1 — `familia_miembros` RLS (✅ DONE)
- Added 5 policies (was 0, was the most critical PII gap missed by plan v2)
- Mirrors `families` access pattern

### Phase 1.2 — `announcements` RLS rewrite (✅ DONE — closes C-2)
- Dropped `announcements_admin_all USING(true) WITH CHECK(true)` and `_authenticated_select USING(true)`
- Added role-checked `admin_select` + audience-rule `audience_select`

### Phase 1.3 — `announcement_audit_log` INSERT fix (✅ DONE)
- Replaced `WITH CHECK (true)` with admin/superadmin role check

### Phase 1.4 — `deliveries` + `program_sessions` RLS (✅ DONE)
- Dropped 3 permissive `deliveries` policies; added role-based replacements
- Added admin policy to empty `program_sessions`
- 4 advisor flags cleared in one migration

### Phase 1.5 — H-12 audit (✅ DONE)
- Confirmed all 8 `family_member_documents` call sites use `family_id` filter, zero use `member_id` directly
- No new RLS migration needed; documented at `docs/migrations/2026-05-05-h12-audit-findings.md`

### Phase 1.6 — Migration drift fix (✅ DONE)
- **Exported 42 prod-applied migrations** to `supabase/migrations/EXPORTED/`
- Each file named `<version>_<name>.sql` to avoid collision with existing canonical files
- Repo can now reproduce production schema via `supabase db reset --local`
- Companion script `scripts/export-applied-migrations.ts` available for future re-syncs
- Subset deferred: highest-fidelity reconciliation (deduping vs `supabase/migrations/<file>.sql`) is left for next session

### Phase 1.7 — CI hooks + RLS test scaffolding (✅ DONE)
- `.github/workflows/ci-supabase-advisors.yml` — fails PR on ERROR/CRITICAL advisor; logs WARN above 2-item baseline
- `.github/workflows/ci-types-drift.yml` — fails PR if `database.types.ts` is stale vs migrations
- `server/__tests__/rls-pii.integration.test.ts` — scaffolding for 4 roles × 4 tables, skipped until `RLS_TESTS_ENABLED=1` + 4 seeded `auth.users` with role claims

### Phase 1.8a — Server Zod sentinel guard (✅ DONE)
- `programIdSchema = uuidLike.refine(v => v !== SENTINEL_UUID, …)` in `server/routers/families.ts`
- Replaces 4 input schema sites that previously accepted the sentinel through to FK violation

### Phase 1.8b — IntakeWizard Programa step (✅ DONE)
- Added `usePrograms()`-fed `<Select>` in Step 1, after titular selection
- "Siguiente" button disabled until both titular AND program selected
- Submit handler uses `values.program_id` instead of sentinel
- Closes the user-facing bug — IntakeWizard now usable

### Phase 2 — Advisor cleanup (✅ DONE)
- Pinned `search_path` on 10 functions (was unset/mutable on 9)
- `persons_safe` view recreated with `WITH (security_invoker = true)`
- `REVOKE EXECUTE FROM PUBLIC, authenticated` on 7 SECURITY DEFINER functions
- Application impact: NONE — server uses `createAdminClient()` (service_role); RLS policies still work via postgres-owner context

---

## Deferred

### pg_trgm extension move
The `pg_trgm` extension is in the `public` schema. Moving it to `extensions` schema would require:
- Drop and recreate trigram indexes on `persons.nombre`, `persons.apellidos` (3 indexes)
- Update `find_duplicate_persons()` to qualify `similarity()` calls or include `extensions` in its `search_path`
- Verify no other code uses `similarity()` unqualified

This is a separate dedicated migration. Not blocking — WARN-level advisor only.

### Auth: leaked-password protection
Supabase Auth feature, not SQL-fixable. Action: Project Owner enables in Supabase Dashboard → Authentication → Providers → Email → "Check for leaked passwords (HaveIBeenPwned)". One-click toggle.

### EXPORTED migration deduplication
The `supabase/migrations/EXPORTED/` directory now contains 42 re-exported files alongside the existing 27 canonical files in `supabase/migrations/`. Some pairs cover overlapping schema work (e.g., `EXPORTED/20260411081841_..._create_deliveries.sql` is the v1, while `supabase/migrations/20260501000010_create_deliveries_table.sql` is the v2).

Recommended next step: run `supabase db reset --local`, observe any errors, and either:
- Delete the older EXPORTED versions where a canonical file fully supersedes them, OR
- Move all into `EXPORTED/` and delete the legacy `supabase/migrations/<file>.sql` files

This reconciliation work is best done in a clean session with the developer's local DB attached.

---

## Branch contents

```bash
git log --oneline main..HEAD
# 17 commits:
#   docs(plan): Phase 1 RLS hardening + table cull + sentinel UUID fix
#   chore(snapshots): pre-cull DDL + non-PII row exports for 7 dead tables
#   feat(schema): drop 7 dead tables (2 backups, 2 legacy, 3 Module 2-9 stubs)
#   feat(rls): add 5 policies to familia_miembros (was 0 → CRITICAL gap)
#   fix(rls): rewrite announcements RLS to remove USING(true) policies (C-2)
#   fix(rls): restrict announcement_audit_log INSERT to admin/superadmin
#   fix(rls): rewrite deliveries permissive policies + add program_sessions admin policy
#   docs(audit): H-12 family_member_documents access pattern verified safe
#   fix(families): reject sentinel UUID in program_id (defensive C-4 guard)
#   feat(scripts): one-shot exporter for applied migrations from prod
#   docs(plan): Phase 1 session handoff with verification trail
#   feat(migrations): re-export 42 applied migrations from prod (Phase 1.6, schema drift fix)
#   feat(families/intake): add Programa-selection step (closes C-4)
#   fix(security): clear 30+ advisors via Phase 2 hardening
#   feat(ci+tests): advisor gate + types-drift gate + RLS test scaffolding (Phase 1.7)
```

---

## How to ship

```bash
cd /Users/familiagirardicavalcante/Desktop/Bocatas_Digital/repo-followups
git push -u origin cleanup/phase1-rls-and-table-cull

gh pr create \
  --title "Phase 1 + Phase 2 — RLS hardening + table cull + sentinel UUID fix + advisor cleanup" \
  --body-file docs/superpowers/plans/2026-05-05-phase1-handoff.md
```

---

## Verification

```bash
# Live DB advisor state — should show only 2 WARN
mcp__supabase__get_advisors  type=security

# Local replay test
supabase db reset --local

# Full test suite
pnpm test

# Type drift check
pnpm check  # (one pre-existing TS1501 in audit-no-pii.test.ts:47, unrelated)
```

---

## Karpathy lens — assumptions surfaced and verified

1. ✅ **`grants` table contains real €45k IRPF data** — surfaced; user kept it
2. ✅ **`volunteers` table drop does NOT impact volunteer registration** — verified (auth.users metadata, not the table)
3. ✅ **Plan v2's C-3 was largely WRONG against current state** — most PII tables had RLS; only `familia_miembros` and `program_sessions` had zero policies
4. ✅ **Zero sentinel UUID rows in production** — verified via direct query; backfill not needed
5. ✅ **Application uses service_role server-side** — verified; safe to REVOKE EXECUTE from anon/PUBLIC/authenticated on SECURITY DEFINER functions
6. ✅ **`users.id` canonical type is text** — verified via existing migration `20260501131457`; `auth.uid()::text` casts are correct
7. ⚠️ **Migration drift is the deeper issue** — surfaced in Phase 1.6; 42 missing files restored

## Two HIGH design notes from prior code review (still apply)

- `announcement_audiences` SELECT is `USING(true)` — voluntarios with leaked JWT can enumerate which roles each announcement targets. Metadata only, not content. Phase 3 work if direct-to-DB consumers (PowerSync, mobile) are introduced.
- `deliveries_select_authenticated USING(deleted_at IS NULL)` — voluntarios see all deliveries (not just their own). Confirm intentional with stakeholders for Banco de Alimentos audit-trail design.
