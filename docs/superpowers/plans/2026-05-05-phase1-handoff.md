# Phase 1 — Session Handoff

**Branch:** `cleanup/phase1-rls-and-table-cull` (off `main` at `e8cca83`)
**Commits:** 10 (see `git log main..HEAD`)
**Date:** 2026-05-05

---

## What was done in this session

### Phase 0.5 — Table cull (✅ DONE)
- Verified live DB inventory + cross-referenced codebase (`grep .from()`, `pg_stat_user_tables`)
- Dropped **7 tables**: `families_pre_backfill_20260430`, `families_miembros_backup_20260505`, `entregas`, `entregas_batch`, `acompanamientos`, `courses`, `volunteers`
- **Kept `grants`** (holds €45k IRPF Alimentos 2026 row — real business data)
- Snapshots written to `docs/migrations/2026-05-05-pre-cull-snapshots/` (DDL + non-PII rows; PII redacted per `CLAUDE.md` §3 compliance)
- Table count: **27 → 20**

### Phase 1.1 — `familia_miembros` RLS (✅ DONE)
- **NEW finding from live audit (not in v2 plan):** `familia_miembros` had RLS enabled with **0 policies** — PII-bearing table effectively unprotected
- Added 5 policies mirroring `families` access pattern (superadmin/admin/voluntario_select/voluntario_insert/beneficiario_select)
- Advisor `rls_enabled_no_policy` for `familia_miembros` cleared

### Phase 1.2 — `announcements` RLS rewrite (✅ DONE — closes plan v2's C-2)
- Dropped `announcements_admin_all USING(true) WITH CHECK(true)` (the worst gap)
- Dropped `announcements_authenticated_select USING(true)`
- Added `announcements_admin_select` (admin/superadmin override) + `announcements_audience_select` (role-match via `announcement_audiences.roles`)
- **Programa-level audience match deferred** — needs canonical "user program" claim in JWT first
- Advisor `rls_policy_always_true` for `announcements_admin_all` cleared

### Phase 1.3 — `announcement_audit_log` INSERT fix (✅ DONE — advisor flag)
- Replaced `WITH CHECK (true)` with role-checked `WITH CHECK (admin/superadmin)`
- **Distinct from PR #28** which fixed PII redaction in audit row content (different layer)
- Advisor `rls_policy_always_true` for audit_log INSERT cleared

### Phase 1.4 — `deliveries` + `program_sessions` RLS (✅ DONE — advisor flags)
- Dropped 3 permissive `deliveries` policies (`USING(true)` / `WITH CHECK(true)`)
- Added `deliveries_admin_all` + `deliveries_voluntario_insert` (with `registrado_por = auth.uid()::text`)
- Added `program_sessions_admin_all` (was empty-policy)
- 4 advisor flags cleared in one migration

### Phase 1.5 — H-12 audit (✅ DONE — no migration needed)
- All 8 `family_member_documents` call sites use `family_id` filter; **zero use `member_id` directly**
- Existing admin-only RLS chain via `family_id` is sufficient post-PR #25
- Findings documented at `docs/migrations/2026-05-05-h12-audit-findings.md`

### Phase 1.8a — Sentinel UUID server guard (✅ DONE — partial close on plan v2's C-4)
- Added `programIdSchema = uuidLike.refine(v => v !== SENTINEL_UUID, …)` and replaced 4 use sites in `server/routers/families.ts`
- API now returns clear error `"Programa requerido: …"` instead of opaque FK violation
- **Live data verified zero sentinel rows** in `program_enrollments` — no backfill needed; FK constraint already exists

---

## What remains (next session)

### Phase 1.6 — Migration drift fix (🟡 SCRIPT WRITTEN, USER RUNS)
- `scripts/export-applied-migrations.ts` ready to run with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env vars
- Reads `supabase_migrations.schema_migrations` (52+ rows on prod) and writes each as `supabase/migrations/EXPORTED/<version>_<name>.sql`
- After running: review for duplicates with existing `supabase/migrations/` files, then `supabase db reset --local` should reproduce prod
- **Why it matters:** without this, every developer's local DB silently diverges from prod, and our Phase 1.x migration files alone cannot recreate the schema

### Phase 1.8b — IntakeWizard Programa-selection step (🟡 UI FOLLOW-UP)
- IntakeWizard currently has 5 steps: Titular, Miembros, Documentación, GUF, Autorizado
- `client/src/features/families/components/IntakeWizard.tsx:445` still hardcodes the sentinel UUID
- With the Zod guard now in place, the wizard fails at API call with a clear message — but **users still cannot register a family**
- Required: insert a Programa step (likely between Titular and Miembros, fed by `trpc.programs.list.useQuery()`), update the form schema, replace line 445 with the selected program_id

### Phase 1.7 — RLS test suite + CI hooks (🟡 DEFERRED)
- Plan document specifies the structure (`server/__tests__/rls-pii.integration.test.ts`)
- Requires seeded test users (voluntario/admin/superadmin/beneficiario) with known roles in `auth.users.raw_user_meta_data`
- CI workflows to add:
  - `.github/workflows/ci-supabase-advisors.yml` (gate on HIGH advisor)
  - `.github/workflows/ci-types-drift.yml` (gate on stale `database.types.ts`)

### Phase 2 advisor cleanup (🟡 OUT OF THIS BRANCH)
Remaining live-DB advisors (none introduced by this branch — all pre-existing):
- 1 ERROR: `persons_safe` view is `SECURITY DEFINER` → switch to `INVOKER` or revoke EXECUTE
- 7 functions are `SECURITY DEFINER` callable by `anon` (`get_user_role`, `find_duplicate_persons`, `confirm_bulk_announcement_import`, `upload_family_document`, `rls_auto_enable`, `get_person_id`, `get_programs_with_counts`)
- 9 functions have mutable `search_path` (search-path-injection risk)
- `pg_trgm` extension in `public` schema
- Auth: leaked-password protection disabled (Supabase dashboard toggle)

### Pre-existing typecheck error
- `server/__tests__/audit-no-pii.test.ts:47` — TS1501 regex flag (added by PR #28). Not caused by this branch. Fix by setting tsconfig `target: "ES2018"+` or rewriting the regex.

---

## How to continue

```bash
cd /Users/familiagirardicavalcante/Desktop/Bocatas_Digital/repo-followups
git status                            # branch is cleanup/phase1-rls-and-table-cull
git log --oneline main..HEAD          # 10 commits

# To run the migration drift exporter (Phase 1.6):
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # NEVER commit
pnpm tsx scripts/export-applied-migrations.ts

# To open a PR for what's done:
git push -u origin cleanup/phase1-rls-and-table-cull
gh pr create --title "Phase 1 — RLS hardening + table cull" \
  --body "$(cat docs/superpowers/plans/2026-05-05-phase1-handoff.md)"
```

---

## Verification commands (run any time)

```bash
# Confirm advisor state (no rls_policy_always_true, no rls_enabled_no_policy)
mcp__supabase__get_advisors  type=security  # via Claude Code

# Confirm policy counts on the touched tables
mcp__supabase__execute_sql  query='SELECT tablename, COUNT(*) FROM pg_policies WHERE schemaname=public AND tablename IN (familia_miembros, announcements, deliveries, announcement_audit_log, program_sessions) GROUP BY tablename ORDER BY tablename'

# Expected:
#   announcement_audit_log     2  (was 2)
#   announcements              6  (was 6 — but composition changed)
#   deliveries                 2  (was 4 — 3 permissive policies dropped, 2 role-checked added)
#   familia_miembros           5  (was 0)
#   program_sessions           1  (was 0)
```

---

## Karpathy lens — what was rejected

These tempting "fixes" were considered and **rejected** in favor of root-cause fixes:

- ❌ Default `program_id` to `programs[0].id` (silent wrong-data) → ✅ Zod guard rejects sentinel; UI must add explicit Programa step
- ❌ Add `USING (true)` policies to PII tables to satisfy advisor → ✅ Real role-based policies for `familia_miembros` and `program_sessions`
- ❌ Wrap webhook fire in try/catch (deferred — already partially logged via PR #c455351 on `feat/novedades-authoring-pipeline` branch)
- ❌ Drop `grants` despite real €45k IRPF data → ✅ Surfaced cost; user kept it
- ❌ Big-bang refactor of `families.ts` (1722 lines) → deferred to plan v2 Phase 5

## SAT assumptions verified during work

- ✅ `users.id` canonical type is **text** (verified via existing `auth.uid()::text` casts in policies; confirmed by prior migration `20260501131457_fix_autor_id_and_edited_by_uuid_to_text`)
- ✅ Zero sentinel UUID rows in production (verified via direct query — backfill not needed)
- ✅ `volunteers` table drop does NOT impact volunteer registration (verified — voluntario role lives in `auth.users.raw_user_meta_data`, not in the dropped table)
- ✅ Plan v2's C-3 ("PII tables have no RLS") was largely WRONG against current state (most PII tables had role-based policies; only `familia_miembros` and `program_sessions` were truly empty)
- ❌ Plan v2 had **no awareness of migration drift** (52 applied migrations vs 22 files in repo) — root-cause fix script written for next session
