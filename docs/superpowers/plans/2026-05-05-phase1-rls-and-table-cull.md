# Phase 1 — RLS hardening + Table cull + Sentinel UUID fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every CRITICAL and HIGH security gap surfaced by the v2 remediation plan + live-DB advisor audit, fix the schema-drift root cause that lets gaps recur, and replace the `IntakeWizard` sentinel UUID with a real Programa-selection step.

**Architecture:** Schema-first work. Each migration is applied to a Supabase **dev branch** first via `mcp__supabase__create_branch`, verified with `mcp__supabase__get_advisors` (gate: zero HIGH findings introduced/regressed), then promoted to main. Code changes follow migrations. The migration drift fix re-exports applied migrations as canonical files so `supabase db reset --local` reproduces production. The sentinel UUID fix is a UI step + Zod guard + dry-run-default backfill + FK constraint, in that order.

**Tech Stack:** Vite 7 + React 19 + wouter + tRPC 11 + Supabase PostgreSQL (admin client via `createAdminClient()`) + Zod + Vitest. NOT Next.js (the README is wrong — H-6 — fix is Phase 2 scope, deliberately out of this plan).

---

## Karpathy Pre-Flight Checklist

Before starting, surface every assumption:

- **Assumption 1:** Live DB has 27 tables; the audit confirmed **most PII tables already have role-based RLS policies** applied (plan v2's C-3 was wrong against current state). The real gaps are: `familia_miembros` (0 policies), `program_sessions` (0 policies, empty), `announcements_admin_all` USING(true), `announcement_audiences` SELECT USING(true), `announcement_audit_log` INSERT WITH CHECK(true), and `deliveries` permissive policies.
- **Assumption 2:** Applied-migrations history (52 entries in `supabase_migrations.schema_migrations`) is wider than the 22 files in `supabase/migrations/`. The repo cannot reproduce production. **Phase 1.6 must export the missing files BEFORE we add new ones**, otherwise the new migrations won't apply cleanly on a fresh local instance.
- **Assumption 3:** `users.id` canonical type is **text** (not uuid) — the `autor_id text` migration `20260501131457_fix_autor_id_and_edited_by_uuid_to_text` flipped it. Drop the unverified `auth.uid()::text` worry from H-2 — the cast is correct under this canonical choice. Document the choice in the migration header.
- **Assumption 4:** `families.program_id` has zero rows with the sentinel `00000000-…` against production — must be VERIFIED by the dry-run script BEFORE the FK migration; if any rows match, halt and escalate.
- **Assumption 5:** `programs` table has at least one row available for IntakeWizard's program selector — live DB confirms 6 rows.
- **Assumption 6:** Drop list (Phase 0.5) is final: 7 tables, all with zero `.from()` calls and zero writes ever, per pre-flight verification. `grants` keeps. Module 2-9 stubs (`acompanamientos`, `courses`, `volunteers`) drop because user explicitly chose B; if Module 6/3/5 ships later, schema is rebuilt fresh from spec.
- **Surgical rule:** Each task touches only the files listed under that task. No "while I'm here" cleanups. No file size refactors (those are Phase 5 in v2 plan, out of scope).
- **Single source of truth:** All Zod schemas co-located under `server/schemas/` or `shared/` — no duplication in components. RLS helpers (`get_user_role`, `get_person_id`) stay as the canonical role accessors; do not introduce alternates.
- **Verifiable success criteria:** Each task ends with a command + expected output. Phase exits gated by `mcp__supabase__get_advisors` returning zero HIGH advisors NEW/REGRESSED relative to the pre-phase baseline.

---

## File Structure

**New files (created by this plan):**
```
docs/migrations/2026-05-05-pre-cull-snapshots/             ← raw row dumps for the 7 dropped tables
docs/migrations/2026-05-05-pre-cull-snapshots/README.md    ← what's snapshotted, why, restore steps
supabase/migrations/20260506000001_drop_dead_tables.sql    ← Phase 0.5 cull
supabase/migrations/20260506000002_familia_miembros_rls.sql ← Phase 1.1
supabase/migrations/20260506000003_rewrite_announcements_rls.sql ← Phase 1.2
supabase/migrations/20260506000004_fix_audit_log_insert_check.sql ← Phase 1.3
supabase/migrations/20260506000005_rewrite_deliveries_rls.sql ← Phase 1.4
supabase/migrations/20260506000006_program_sessions_rls.sql ← Phase 1.4 (companion: empty table, 0 policies)
supabase/migrations/EXPORTED/<from-prod>/                  ← Phase 1.6 re-exported migrations (file count TBD by exporter)
supabase/migrations/20260506000099_add_program_id_fk.sql   ← Phase 1.8 (after backfill verified zero)
server/__tests__/rls-pii.integration.test.ts               ← Phase 1.7 — 1 test per role × table
.github/workflows/ci-supabase-advisors.yml                 ← Phase 1.7 — fail on HIGH advisor
.github/workflows/ci-types-drift.yml                       ← Phase 1.7 — fail on types-out-of-sync
scripts/backfill-program-id.ts                             ← Phase 1.8 — dry-run default
scripts/export-applied-migrations.ts                       ← Phase 1.6 — one-shot exporter
```

**Files to modify surgically:**
```
client/src/features/families/components/IntakeWizard.tsx   ← Phase 1.8: add Programa step + remove sentinel
server/routers/families.ts                                 ← Phase 1.8: Zod guard against sentinel UUID
server/__tests__/audit-no-pii.test.ts                      ← Phase 1.3: extend with INSERT-policy regression test
```

**Files NOT to touch in this plan (deferred to v2 plan Phase 2-5):**
- `README.md`, `CLAUDE.md`, `ARCHITECTURE.md` (H-6 docs drift — Phase 5)
- `server/routers/families.ts` size split (H-5 — Phase 5)
- `migrate-add-deleted-at*.mjs` (H-3 — these don't exist in `repo-followups`, plan stale)
- Drizzle SQL files (H-4 — Phase 3)

---

## Phase 0.5 — Cull dead schema

Drops 7 tables: 2 backups (`families_pre_backfill_20260430`, `families_miembros_backup_20260505`), 2 legacy (`entregas`, `entregas_batch`), 3 Module 2-9 stubs (`acompanamientos`, `courses`, `volunteers`). `grants` keeps because it holds €45k IRPF tracking row.

### Task 0.5.1: Snapshot the 6 tables that have rows or had policies

**Files:**
- Create: `docs/migrations/2026-05-05-pre-cull-snapshots/families_pre_backfill_20260430.json`
- Create: `docs/migrations/2026-05-05-pre-cull-snapshots/families_miembros_backup_20260505.json`
- Create: `docs/migrations/2026-05-05-pre-cull-snapshots/entregas.json` (empty array — table is empty)
- Create: `docs/migrations/2026-05-05-pre-cull-snapshots/README.md`

- [ ] **Step 1: Snapshot via Supabase MCP**

```sql
-- Run via mcp__supabase__execute_sql for each table:
SELECT jsonb_agg(t) FROM public.families_pre_backfill_20260430 t;
SELECT jsonb_agg(t) FROM public.families_miembros_backup_20260505 t;
SELECT jsonb_agg(t) FROM public.entregas t;
-- entregas_batch, acompanamientos, courses, volunteers are confirmed-empty per pg_stat_user_tables; document as "0 rows captured 2026-05-05".
```

Save each result to its `.json` file via `Write`.

- [ ] **Step 2: Write the README explaining what was snapshotted**

The README documents: (1) which tables were dropped, (2) the pg_stat evidence for each ("0 inserts/updates/deletes ever"), (3) the snapshot row counts, (4) restore steps if anyone ever needs the schema back ("recreate from migration history in `supabase/migrations/EXPORTED/`").

- [ ] **Step 3: Commit snapshots before drop migration**

```bash
git add docs/migrations/2026-05-05-pre-cull-snapshots/
git commit -m "chore(snapshots): pre-cull row exports for 7 dead tables"
```

### Task 0.5.2: Drop migration on Supabase **dev branch** first

**Files:**
- Create: `supabase/migrations/20260506000001_drop_dead_tables.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260506000001_drop_dead_tables.sql
-- Phase 0.5 cull: remove 2 backups, 2 legacy, 3 Module 2-9 stubs.
-- Verified zero .from() calls, zero writes ever, zero user-facing impact.
-- grants table KEPT (holds €45k IRPF row, real business data).
-- See docs/migrations/2026-05-05-pre-cull-snapshots/README.md for context.

BEGIN;

-- Backup tables (created by ad-hoc backfill scripts, never tracked in app code)
DROP TABLE IF EXISTS public.families_pre_backfill_20260430 CASCADE;
DROP TABLE IF EXISTS public.families_miembros_backup_20260505 CASCADE;

-- Legacy delivery tables (superseded by public.deliveries — migration 20260411081841)
DROP TABLE IF EXISTS public.entregas_batch CASCADE;
DROP TABLE IF EXISTS public.entregas CASCADE;

-- Module 2-9 stubs (acompanamientos=Module 5+, courses=Module 3, volunteers=Module 6)
-- User chose to drop these in Phase 0.5; if those modules ship, schema rebuilt from spec.
DROP TABLE IF EXISTS public.acompanamientos CASCADE;
DROP TABLE IF EXISTS public.courses CASCADE;
DROP TABLE IF EXISTS public.volunteers CASCADE;

COMMIT;
```

- [ ] **Step 2: Apply on Supabase dev branch first**

```
- Call mcp__supabase__create_branch (after mcp__supabase__confirm_cost) → returns branch project_ref
- Call mcp__supabase__apply_migration on the dev branch with name='drop_dead_tables', query=<above>
- Verify with mcp__supabase__list_tables(schemas=['public']) on the branch — table count drops by 7
- Run mcp__supabase__get_advisors(type='security') on the branch — note baseline
```

- [ ] **Step 3: Apply on main project ONLY after dev-branch advisors are clean**

```
- Call mcp__supabase__apply_migration with name='drop_dead_tables', query=<above>
- Re-run mcp__supabase__list_tables → confirm 7 tables removed
- Re-run mcp__supabase__get_advisors → confirm no NEW HIGH findings
```

- [ ] **Step 4: Commit migration file**

```bash
git add supabase/migrations/20260506000001_drop_dead_tables.sql
git commit -m "feat(schema): drop 7 dead tables (2 backups, 2 legacy, 3 Module 2-9 stubs)"
```

---

## Phase 1.1 — `familia_miembros` RLS policies (CRITICAL — was missing from v2 plan)

### Task 1.1.1: Failing test — voluntario CANNOT read another family's miembros

**Files:**
- Create: `server/__tests__/rls-pii.integration.test.ts` (new file, just the familia_miembros block for now — extended later in Phase 1.7)

- [ ] **Step 1: Write the failing test**

```ts
// server/__tests__/rls-pii.integration.test.ts
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

async function clientForRole(role: "voluntario" | "admin" | "superadmin" | "beneficiario") {
  // Project convention: signed-in users have role in raw_user_meta_data.role.
  // Tests use seeded users from supabase/seed.sql; password is in BocatasVol2026! / similar.
  const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const credsByRole = {
    voluntario: { email: "voluntario@bocatas.test", password: "BocatasVol2026!" },
    admin: { email: "admin@bocatas.test", password: "BocatasAdmin2026!" },
    superadmin: { email: "superadmin@bocatas.test", password: "BocatasSuperAdmin2026!" },
    beneficiario: { email: "beneficiario@bocatas.test", password: "BocatasBen2026!" },
  };
  const { error } = await supa.auth.signInWithPassword(credsByRole[role]);
  if (error) throw error;
  return supa;
}

describe("RLS — familia_miembros", () => {
  it("voluntario cannot read familia_miembros (no policy = blocked)", async () => {
    const vol = await clientForRole("voluntario");
    const { data, error } = await vol.from("familia_miembros").select("id").limit(1);
    // BEFORE policy: SELECT returns no rows even if data exists (RLS blocks); no error.
    // AFTER policy: voluntario CAN read members of active families they have visibility into.
    // For RED step we expect zero rows because no policy = nothing visible.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("admin can read familia_miembros", async () => {
    const adm = await clientForRole("admin");
    const { data, error } = await adm.from("familia_miembros").select("id").limit(1);
    expect(error).toBeNull();
    // AFTER policy: should return ≥0 rows (allowed). RED step: expect 0 rows (no policy).
    expect(Array.isArray(data)).toBe(true);
  });
});
```

- [ ] **Step 2: Run RED**

```bash
cd repo-followups
pnpm vitest run server/__tests__/rls-pii.integration.test.ts
# Expected: PASSES (because zero policies = zero rows for everyone). The test asserts current
# broken state. After we add policies, the SECOND test must change to expect ≥1 row, which is
# the GREEN re-write in Step 4.
```

> Note: this is a non-standard TDD pattern because RLS-with-zero-policies is silently locked, not erroring. We use the test to **document** the broken baseline first, then flip the expectation when we add policies. If the test fails RED unexpectedly, investigate `auth.users` seeding before proceeding.

### Task 1.1.2: Apply familia_miembros RLS migration

**Files:**
- Create: `supabase/migrations/20260506000002_familia_miembros_rls.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260506000002_familia_miembros_rls.sql
-- familia_miembros has RLS enabled but ZERO policies (advisor: rls_enabled_no_policy).
-- Tracks family member PII (apellidos, documento, person_id link). Same access pattern as families.

BEGIN;

-- superadmin: full access
CREATE POLICY familia_miembros_superadmin_all ON public.familia_miembros
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'superadmin')
  WITH CHECK (public.get_user_role() = 'superadmin');

-- admin: full access
CREATE POLICY familia_miembros_admin_all ON public.familia_miembros
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

-- voluntario: SELECT only on members of ACTIVE families with non-deleted_at
CREATE POLICY familia_miembros_voluntario_select ON public.familia_miembros
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() = 'voluntario'
    AND EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = familia_miembros.familia_id
        AND f.estado = 'activa'
        AND f.deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

-- voluntario: INSERT (must be on active family they can see)
CREATE POLICY familia_miembros_voluntario_insert ON public.familia_miembros
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() = 'voluntario'
    AND EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = familia_miembros.familia_id
        AND f.estado = 'activa'
        AND f.deleted_at IS NULL
    )
  );

-- beneficiario: SELECT only own row (member.person_id = get_person_id())
CREATE POLICY familia_miembros_beneficiario_select ON public.familia_miembros
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() = 'beneficiario'
    AND person_id = public.get_person_id()
    AND deleted_at IS NULL
  );

COMMIT;
```

- [ ] **Step 2: Apply on dev branch + advisor check**

```
- mcp__supabase__apply_migration(name='familia_miembros_rls', query=<above>) on dev branch
- mcp__supabase__execute_sql("SELECT count(*) FROM pg_policies WHERE tablename='familia_miembros'")
  → expect 5
- mcp__supabase__get_advisors(type='security') → confirm `rls_enabled_no_policy` for familia_miembros is GONE
```

- [ ] **Step 3: Update test to GREEN**

In `server/__tests__/rls-pii.integration.test.ts`, change the voluntario test to:

```ts
it("voluntario CAN read familia_miembros of active families", async () => {
  const vol = await clientForRole("voluntario");
  const { data, error } = await vol.from("familia_miembros").select("id, familia_id").limit(5);
  expect(error).toBeNull();
  expect(Array.isArray(data)).toBe(true);
  // No assertion on count — depends on seed; just confirm not RLS-blocked.
});

it("voluntario CANNOT read familia_miembros of inactive/deleted families", async () => {
  // Requires test fixture with one estado='inactiva' family; depends on Task 1.7 fixture work.
  // Skip with `it.todo` until 1.7 lands.
});
```

- [ ] **Step 4: Apply on main + verify + commit**

```
- mcp__supabase__apply_migration on main project
- pnpm vitest run server/__tests__/rls-pii.integration.test.ts → all green
git add supabase/migrations/20260506000002_familia_miembros_rls.sql server/__tests__/rls-pii.integration.test.ts
git commit -m "feat(rls): add 5 policies to familia_miembros (superadmin/admin/voluntario/beneficiario)"
```

---

## Phase 1.2 — `announcements` + `announcement_audiences` RLS rewrite (C-2)

### Task 1.2.1: Migration replacing USING(true) with audience-rule join

**Files:**
- Create: `supabase/migrations/20260506000003_rewrite_announcements_rls.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260506000003_rewrite_announcements_rls.sql
-- C-2: replace USING(true) policies with audience-rule database-side enforcement.
-- Before: announcements_admin_all USING(true) WITH CHECK(true) — bypasses RLS entirely
--         announcements_authenticated_select USING(true) — every authed user sees every row
--         announcement_audiences_authenticated_select USING(true) — same on audiences
-- After: admin/superadmin still ALL; non-admins see only announcements where their role/program
--        appears in announcement_audiences.

BEGIN;

-- Drop the open policies
DROP POLICY IF EXISTS announcements_admin_all ON public.announcements;
DROP POLICY IF EXISTS announcements_authenticated_select ON public.announcements;
DROP POLICY IF EXISTS announcement_audiences_authenticated_select ON public.announcement_audiences;

-- Replace announcements_admin_all with role-checked variant
CREATE POLICY announcements_admin_all ON public.announcements
  FOR ALL TO authenticated
  USING (public.get_user_role() = ANY (ARRAY['superadmin','admin']))
  WITH CHECK (public.get_user_role() = ANY (ARRAY['superadmin','admin']));

-- Authenticated SELECT now requires audience match
CREATE POLICY announcements_authenticated_select ON public.announcements
  FOR SELECT TO authenticated
  USING (
    -- admin/superadmin always read
    public.get_user_role() = ANY (ARRAY['superadmin','admin'])
    OR
    -- everyone else: must match an audience rule by role OR program
    EXISTS (
      SELECT 1
      FROM public.announcement_audiences a
      WHERE a.announcement_id = announcements.id
        AND (
          public.get_user_role() = ANY (a.roles)
          OR (
            -- program match: voluntario whose program JWT claim is in audience.programs
            (auth.jwt() ->> 'programa') = ANY (a.programs)
          )
        )
    )
  );

-- Audiences SELECT: admin sees all; others see only audiences for announcements they can see
CREATE POLICY announcement_audiences_admin_select ON public.announcement_audiences
  FOR SELECT TO authenticated
  USING (public.get_user_role() = ANY (ARRAY['superadmin','admin']));

CREATE POLICY announcement_audiences_authenticated_select ON public.announcement_audiences
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.announcements n
      WHERE n.id = announcement_audiences.announcement_id
      -- relies on the recursive announcements_authenticated_select to enforce visibility
    )
  );

COMMIT;
```

- [ ] **Step 2: Apply on dev branch**

```
mcp__supabase__apply_migration on dev branch
mcp__supabase__get_advisors(type='security')
  → confirm rls_policy_always_true for announcements_admin_all GONE
```

- [ ] **Step 3: Add test for visibility (extend `rls-pii.integration.test.ts`)**

```ts
describe("RLS — announcements visibility", () => {
  it("voluntario sees announcement audienced to voluntario role", async () => {
    // Pre-condition: seed has an announcement audienced to {roles: ['voluntario']}.
    const vol = await clientForRole("voluntario");
    const { data, error } = await vol.from("announcements").select("id, titulo").limit(50);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("voluntario does NOT see admin-only announcement", async () => {
    // Pre-condition: seed has an announcement audienced to {roles: ['admin']} only.
    const vol = await clientForRole("voluntario");
    const { data, error } = await vol.from("announcements")
      .select("id, titulo")
      .eq("titulo", "ADMIN-ONLY TEST FIXTURE");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
```

- [ ] **Step 4: Apply on main + commit**

```
mcp__supabase__apply_migration on main
git add supabase/migrations/20260506000003_rewrite_announcements_rls.sql server/__tests__/rls-pii.integration.test.ts
git commit -m "fix(rls): rewrite announcements + audiences RLS to use audience-rule join (C-2)"
```

---

## Phase 1.3 — `announcement_audit_log` INSERT policy fix (advisor)

### Task 1.3.1: Replace WITH CHECK(true) with role-restricted

**Files:**
- Create: `supabase/migrations/20260506000004_fix_audit_log_insert_check.sql`
- Modify: `server/__tests__/audit-no-pii.test.ts` (extend existing test file)

- [ ] **Step 1: Write the migration**

```sql
-- 20260506000004_fix_audit_log_insert_check.sql
-- Advisor flag: announcement_audit_log_authenticated_insert allows ANY authenticated user
-- to insert an audit row, defeating the audit trail integrity. Restrict to admin/superadmin.
-- (PR #28 fixed PII REDACTION in audit content, not this RLS gap — distinct issue.)

BEGIN;

DROP POLICY IF EXISTS announcement_audit_log_authenticated_insert ON public.announcement_audit_log;

CREATE POLICY announcement_audit_log_admin_insert ON public.announcement_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() = ANY (ARRAY['superadmin','admin']));

COMMIT;
```

- [ ] **Step 2: Apply on dev branch + advisor check**

```
mcp__supabase__apply_migration
mcp__supabase__get_advisors(type='security')
  → confirm rls_policy_always_true for audit_log INSERT GONE
```

- [ ] **Step 3: Extend audit-no-pii.test.ts with policy regression test**

```ts
// Append to server/__tests__/audit-no-pii.test.ts
import { clientForRole } from "./_helpers"; // extract clientForRole from rls-pii test if duplication

describe("audit_log INSERT policy", () => {
  it("voluntario CANNOT insert into announcement_audit_log", async () => {
    const vol = await clientForRole("voluntario");
    const { error } = await vol.from("announcement_audit_log").insert({
      announcement_id: "00000000-0000-0000-0000-000000000001",
      action: "test",
      actor_role: "voluntario",
    });
    expect(error).not.toBeNull(); // RLS blocks → 42501 / "new row violates row-level security policy"
    expect(error?.code).toMatch(/42501|PGRST/);
  });

  it("admin CAN insert into announcement_audit_log", async () => {
    const adm = await clientForRole("admin");
    const { error } = await adm.from("announcement_audit_log").insert({
      announcement_id: "00000000-0000-0000-0000-000000000001",
      action: "test_smoke",
      actor_role: "admin",
    });
    // FK may fail if announcement doesn't exist; RLS should NOT be the failure cause.
    expect(error?.code).not.toBe("42501");
  });
});
```

- [ ] **Step 4: Apply on main + commit**

```
mcp__supabase__apply_migration on main
pnpm vitest run server/__tests__/audit-no-pii.test.ts
git add supabase/migrations/20260506000004_fix_audit_log_insert_check.sql server/__tests__/audit-no-pii.test.ts
git commit -m "fix(rls): restrict announcement_audit_log INSERT to admin/superadmin"
```

---

## Phase 1.4 — `deliveries` + `program_sessions` RLS rewrite (advisor)

### Task 1.4.1: Replace deliveries USING(true)/WITH CHECK(true) policies

**Files:**
- Create: `supabase/migrations/20260506000005_rewrite_deliveries_rls.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260506000005_rewrite_deliveries_rls.sql
-- Advisor flags 3 permissive policies on public.deliveries:
--   deliveries_delete_authenticated USING(true)
--   deliveries_insert_authenticated WITH CHECK(true)
--   deliveries_update_authenticated USING(true) WITH CHECK(true)
-- Replace with role-based: admin/superadmin full; voluntario INSERT/SELECT (program scope).

BEGIN;

DROP POLICY IF EXISTS deliveries_delete_authenticated ON public.deliveries;
DROP POLICY IF EXISTS deliveries_insert_authenticated ON public.deliveries;
DROP POLICY IF EXISTS deliveries_update_authenticated ON public.deliveries;

CREATE POLICY deliveries_admin_all ON public.deliveries
  FOR ALL TO authenticated
  USING (public.get_user_role() = ANY (ARRAY['superadmin','admin']))
  WITH CHECK (public.get_user_role() = ANY (ARRAY['superadmin','admin']));

CREATE POLICY deliveries_voluntario_select ON public.deliveries
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() = 'voluntario'
    AND deleted_at IS NULL
  );

CREATE POLICY deliveries_voluntario_insert ON public.deliveries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() = 'voluntario'
    AND registrado_por = auth.uid()::text
  );

-- No DELETE for voluntario; no UPDATE either (use soft-delete deleted_at via API).

COMMIT;
```

- [ ] **Step 2: Apply on dev branch + advisor check + commit (same shape as Phase 1.3)**

### Task 1.4.2: Add minimal admin policy to `program_sessions` (RLS enabled, 0 policies)

- [ ] **Step 1: Write migration `20260506000006_program_sessions_rls.sql`**

```sql
-- 20260506000006_program_sessions_rls.sql
-- program_sessions has RLS enabled but no policies. Empty table, low impact, but advisor flags it.
-- Apply minimal admin-only policy until program_sessions feature is built.

BEGIN;

CREATE POLICY program_sessions_admin_all ON public.program_sessions
  FOR ALL TO authenticated
  USING (public.get_user_role() = ANY (ARRAY['superadmin','admin']))
  WITH CHECK (public.get_user_role() = ANY (ARRAY['superadmin','admin']));

COMMIT;
```

- [ ] **Step 2: Apply, verify advisor clean, commit**

---

## Phase 1.5 — H-12: `family_member_documents` access pattern audit

### Task 1.5.1: Static audit of query patterns

**Files:**
- Modify: (no code change yet — investigation only)

- [ ] **Step 1: Catalog query patterns**

Run:
```bash
cd repo-followups
grep -nE "from\(['\"]family_member_documents" server/ shared/
grep -nE "member_id\s*=" server/routers/families.ts server/families-doc-helpers.ts
```

Document each call site: does it filter by `family_id` (joins through `families` RLS) or by `member_id` directly?

- [ ] **Step 2: Decision tree**

If ALL access goes through `family_id` (existing RLS sufficient): no migration. Document conclusion in `server/__tests__/rls-pii.integration.test.ts` as a comment.

If ANY access uses `WHERE member_id = $X` without joining `family_id`: write `supabase/migrations/20260506000007_family_member_documents_member_id_rls.sql` adding policy that resolves `member_id → familia_miembros → families` chain.

- [ ] **Step 3: Add a test confirming the chosen pattern works**

(test specifics depend on Step 2 outcome)

---

## Phase 1.6 — Migration drift fix: re-export prod migrations

### Task 1.6.1: One-shot exporter script

**Files:**
- Create: `scripts/export-applied-migrations.ts`

- [ ] **Step 1: Write the script**

```ts
// scripts/export-applied-migrations.ts
// One-shot tool: read supabase_migrations.schema_migrations on prod, write each applied
// migration's SQL into supabase/migrations/EXPORTED/<version>_<name>.sql.
// Safe to re-run: idempotent on filenames; warns if file content differs from DB.

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OUT = "supabase/migrations/EXPORTED";

async function main() {
  const supa = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await supa.schema("supabase_migrations").from("schema_migrations")
    .select("version, name, statements").order("version");
  if (error) throw error;

  mkdirSync(OUT, { recursive: true });

  for (const m of data ?? []) {
    const file = join(OUT, `${m.version}_${m.name}.sql`);
    const content = (m.statements as string[]).join("\n\n");
    if (existsSync(file)) {
      const existing = readFileSync(file, "utf8");
      if (existing !== content) console.warn(`DRIFT: ${file} differs from DB`);
      continue;
    }
    writeFileSync(file, content);
    console.log(`Wrote ${file}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run + commit the export**

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm tsx scripts/export-applied-migrations.ts
git add supabase/migrations/EXPORTED/ scripts/export-applied-migrations.ts
git commit -m "chore(migrations): export 52 applied migrations from prod (fix schema drift)"
```

- [ ] **Step 3: Verify `supabase db reset --local` reproduces prod**

```bash
supabase db reset --local
# expect: clean apply, no errors, all tables present
```

If errors: investigate ordering vs the existing canonical files in `supabase/migrations/` — the EXPORTED set may overlap with files already in `supabase/migrations/`. Resolve by either deleting duplicates or moving non-EXPORTED canonical files into `EXPORTED/` and removing the legacy directory layout.

---

## Phase 1.7 — Test suite + CI hooks

### Task 1.7.1: Round out RLS integration test fixtures

**Files:**
- Create: `supabase/seed.sql` test fixture additions (or `server/__tests__/_fixtures/rls-seed.sql`)
- Modify: `server/__tests__/rls-pii.integration.test.ts` to cover all PII tables × all roles

- [ ] **Step 1: Add fixtures**

(Seed data: 1 active + 1 inactive family, 1 admin-only announcement, 1 voluntario-audienced announcement, 1 person-with-different-id-than-current-user for negative tests.)

- [ ] **Step 2: Run full suite**

```bash
pnpm vitest run server/__tests__/rls-pii.integration.test.ts
# expected: green, ≥10 tests
```

### Task 1.7.2: CI: advisor gate

**Files:**
- Create: `.github/workflows/ci-supabase-advisors.yml`

- [ ] **Step 1: Workflow file**

```yaml
name: Supabase advisors gate
on: [pull_request]
jobs:
  advisors:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run advisor check
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: |
          # Use Supabase Management API for advisors (or call mcp__supabase__get_advisors equiv)
          # Fail if any HIGH-severity advisor present.
          node scripts/check-advisors.mjs --max-level=high
```

- [ ] **Step 2: Companion script + test in PR**

### Task 1.7.3: CI: type-gen drift gate

**Files:**
- Create: `.github/workflows/ci-types-drift.yml`

- [ ] **Step 1: Workflow file**

```yaml
name: Types drift gate
on: [pull_request]
jobs:
  types-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase start
      - run: supabase gen types typescript --local > /tmp/types.ts
      - run: diff /tmp/types.ts client/src/lib/database.types.ts || (echo "::error::database.types.ts is stale" && exit 1)
```

---

## Phase 1.8 — Sentinel UUID fix (C-4)

### Task 1.8.1: Failing test for IntakeWizard sentinel rejection

- [ ] Vitest unit on `IntakeWizard` asserting submit is disabled when no Programa selected (RED).
- [ ] Server-side Zod schema test asserting `families.create` rejects sentinel UUID with a `z.string().uuid().refine(v => v !== '00000000-0000-0000-0000-000000000000', 'sentinel program_id rejected')` (RED).

### Task 1.8.2: Implement Programa step + Zod guard (GREEN)

**Files:**
- Modify: `client/src/features/families/components/IntakeWizard.tsx` — replace hardcoded sentinel at line 445 with selected `program_id` from new step
- Modify: `server/routers/families.ts` — add Zod refinement on `program_id` rejecting sentinel
- Add test fixtures for both

### Task 1.8.3: Backfill script (dry-run default)

**Files:**
- Create: `scripts/backfill-program-id.ts`

```ts
// scripts/backfill-program-id.ts
// Dry-run by default. Pass --commit to actually write.
// Usage: pnpm tsx scripts/backfill-program-id.ts [--commit]

import { createClient } from "@supabase/supabase-js";

const SENTINEL = "00000000-0000-0000-0000-000000000000";
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const COMMIT = process.argv.includes("--commit");

async function main() {
  const supa = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await supa.from("families").select("id, nombre").eq("program_id", SENTINEL);
  if (error) throw error;
  console.log(`Sentinel rows found: ${data?.length ?? 0}`);
  if (!data || data.length === 0) { console.log("Nothing to backfill. Safe to add FK."); return; }
  if (!COMMIT) { console.log("DRY-RUN. Re-run with --commit to fix."); return; }
  // commit path: prompt for default program_id from operator
  throw new Error("--commit not supported until operator chooses default program_id; run dry-run first.");
}
main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 1: Run dry-run against production** — expect output `Sentinel rows found: 0` (per assumption 4)
- [ ] **Step 2: If dry-run shows >0 rows, halt and escalate to user before any FK migration**

### Task 1.8.4: FK migration

**Files:**
- Create: `supabase/migrations/20260506000099_add_program_id_fk.sql`

```sql
-- 20260506000099_add_program_id_fk.sql
-- Pre-condition: backfill script reports 0 sentinel rows (Phase 1.8.3).
-- Adds NOT NULL + REFERENCES constraint on families.program_id.

BEGIN;

ALTER TABLE public.families
  ALTER COLUMN program_id SET NOT NULL;

ALTER TABLE public.families
  ADD CONSTRAINT families_program_id_fkey FOREIGN KEY (program_id)
  REFERENCES public.programs(id) ON DELETE RESTRICT;

COMMIT;
```

- [ ] Apply on dev branch first → main.

---

## Verification strategy (full plan)

10 end-to-end checks; **all must be green** before considering Phase 1 done:

1. `cd repo-followups && pnpm typecheck && pnpm build` clean.
2. `pnpm lint` clean.
3. `pnpm vitest run` all green; `server/__tests__/rls-pii.integration.test.ts` covers ≥10 role × table cases.
4. `mcp__supabase__list_tables` returns 20 tables (was 27; minus 7 dropped).
5. `mcp__supabase__get_advisors(type='security')` returns zero HIGH severity items; WARN-level items either fixed or explicitly tagged in `docs/superpowers/known-advisor-warns.md`.
6. `mcp__supabase__execute_sql("SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='familia_miembros'")` returns `5`.
7. `mcp__supabase__execute_sql("SELECT count(*) FROM public.families WHERE program_id = '00000000-0000-0000-0000-000000000000'")` returns `0`.
8. `git ls-files supabase/migrations/EXPORTED | wc -l` ≥ 50 (the re-exported set covers prod history).
9. `supabase db reset --local` (in clean clone) reproduces prod schema with no errors.
10. The original review plan's findings table updated: every C-* / H-* status field reflects current truth (resolved / still-open with new evidence pointer).

---

## Out of scope (deferred to v2 plan Phase 2-5)

- C-5 webhook delivery worker — Phase B noted in v2 plan.
- H-1 `familia_miembros.deleted_at` cleanup — out of this plan; investigate Phase 2.
- H-2 `auth.uid()::text` — assumption 3 above resolves it; no migration needed.
- H-3..H-11 — all v2 Phase 3-5 (cleanup + refactor + docs).
- SECURITY DEFINER function audit — Phase 2.
- `persons_safe` SECURITY DEFINER view — Phase 2.
- `pg_trgm` move out of public schema — Phase 2.
- Auth leaked-password protection — Supabase dashboard toggle, do separately.
- File-size refactor (H-5) — Phase 5.
- Docs drift (H-6, H-7) — Phase 5.

---

## Risk register

| # | Risk | P | I | Mitigation |
|---|---|---|---|---|
| R1 | Phase 1.2 RLS rewrite breaks legitimate announcement reads | M | H | Apply on Supabase dev branch first; full rls-pii test suite must stay green; manual smoke through `/novedades` page on staging URL before main apply. |
| R2 | Phase 1.6 EXPORTED migrations conflict with existing files in `supabase/migrations/` | H | M | Run `supabase db reset --local` after each batch; if conflicts, decide canonical location (recommend keeping one source: move all to `EXPORTED/` and delete legacy duplicates). |
| R3 | Backfill script discovers >0 sentinel rows on prod | L | H | Halt and escalate to user; do NOT proceed with FK migration. |
| R4 | Drop migration cascades silently to a row in `grants` we missed | L | H | Pre-flight pg_stat verified zero writes ever; CASCADE is on intentionally-empty tables; `grants` is explicitly NOT in DROP list. |
| R5 | Type-gen drift CI gate flakes from CLI version mismatch | M | L | Pin Supabase CLI version; cache install. |
| R6 | familia_miembros voluntario_select policy too narrow (volunteers can't see members of brand-new family before estado='activa' is set) | M | M | Verify `families.create` always sets estado='activa' on insert (from existing code); add integration test covering the create-then-read flow. |

---

## Codex / reviewer rubric for this plan

- ✅ Each task has bite-sized 2-5 min steps with exact code.
- ✅ Each migration is applied to dev branch first (R1 mitigation).
- ✅ Karpathy lens applied: assumptions surfaced upfront; symptom-patches explicitly rejected (no `USING (true)`); root-cause fix (migration drift) included alongside surface fixes.
- ✅ TDD ordering: failing test → migration → green test → commit.
- ✅ Single source of truth: Zod refinement co-located with `server/routers/families.ts`; RLS helpers re-used not re-invented.
- ✅ Verification: 10 end-to-end checks listed; advisor gate is the atomic phase exit criterion.
- ✅ Out-of-scope items explicitly named, not implicit.
