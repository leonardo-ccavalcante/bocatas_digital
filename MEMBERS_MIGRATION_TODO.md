# Family Members Migration - Scalable Solution TODO

**Goal:** Fix bug where dashboard shows "Total miembros: 1" but modal shows "Miembros Actuales (0)" by consolidating family members into `familia_miembros` table (scalable architecture).

**Root Cause:** Two conflicting systems:
- Dashboard uses `families.miembros` JSON array (has data)
- Modal uses `familia_miembros` table (empty)

**Solution:** Migrate to single source of truth: `familia_miembros` table

---

## Phase 1: Planning & Test Design

- [ ] **1.1** Review current `familia_miembros` table schema in Supabase
- [ ] **1.2** Review `families.miembros` JSON structure
- [ ] **1.3** Write TDD test: migration creates familia_miembros records from families.miembros
- [ ] **1.4** Write TDD test: families.getById returns members from tabla (not JSON)
- [ ] **1.5** Write TDD test: families.getAll returns members from tabla
- [ ] **1.6** Verify all tests fail (RED phase)

---

## Phase 2: Database Migration

- [ ] **2.1** Create Supabase migration: `20260505_migrate_miembros_to_table.sql`
  - [ ] 2.1a: Create `familia_miembros` table if not exists (with all required columns)
  - [ ] 2.1b: Migrate data from `families.miembros` JSON → `familia_miembros` table
  - [ ] 2.1c: Add foreign key constraints
  - [ ] 2.1d: Add indexes for performance

- [ ] **2.2** Apply migration via Supabase MCP
- [ ] **2.3** Verify data migrated correctly (run verification query)
- [ ] **2.4** Verify all TDD tests pass (GREEN phase)

---

## Phase 3: Server-Side Updates

- [ ] **3.1** Update `server/routers/families.ts` - `getById` procedure
  - [ ] 3.1a: Remove `miembros` from families.select (no longer JSON)
  - [ ] 3.1b: Add query to fetch members from `familia_miembros` table
  - [ ] 3.1c: Join members with family object in response

- [ ] **3.2** Update `server/routers/families.ts` - `getAll` procedure
  - [ ] 3.2a: Remove `miembros` from families.select
  - [ ] 3.2b: Add query to fetch members from `familia_miembros` table

- [ ] **3.3** Update `server/routers/families.ts` - `create` procedure
  - [ ] 3.3a: When creating family with miembros, insert into `familia_miembros` instead of JSON

- [ ] **3.4** Run server tests - verify procedures work correctly
- [ ] **3.5** Verify TDD tests still pass

---

## Phase 4: Client-Side Updates

- [ ] **4.1** Update `client/src/pages/FamiliaDetalle.tsx`
  - [ ] 4.1a: Remove `const miembros = (family.miembros as unknown[]) ?? [];`
  - [ ] 4.1b: Update to use `family.miembros` from server response (now from tabla)
  - [ ] 4.1c: Update member list display to show members from tabla

- [ ] **4.2** Update `client/src/components/MemberManagementModal.tsx`
  - [ ] 4.2a: Verify it uses `trpc.families.getMembers` (should work with tabla now)
  - [ ] 4.2b: Test that modal displays members correctly

- [ ] **4.3** Run client tests and verify no TypeScript errors

---

## Phase 5: Cleanup & Verification

- [ ] **5.1** Remove `families.miembros` JSON column from schema (after verification)
- [ ] **5.2** Run full test suite (827+ tests should pass)
- [ ] **5.3** Manual testing:
  - [ ] 5.3a: Navigate to family with members
  - [ ] 5.3b: Verify dashboard shows correct count
  - [ ] 5.3c: Verify modal shows members list
  - [ ] 5.3d: Test adding new member
  - [ ] 5.3e: Test editing member
  - [ ] 5.3f: Test deleting member

- [ ] **5.4** Verify logging system still works (no regressions)
- [ ] **5.5** Create final checkpoint

---

## Verification Checklist

Before marking complete:

- [ ] All TDD tests written and passing
- [ ] Migration applied successfully
- [ ] Dashboard shows "Total miembros: 1" ✅
- [ ] Modal shows "Miembros Actuales (1)" ✅
- [ ] Members list displays correctly ✅
- [ ] Add/edit/delete operations work ✅
- [ ] No TypeScript errors ✅
- [ ] Full test suite passes (827+ tests) ✅
- [ ] Logging system working ✅
- [ ] Final checkpoint created ✅

---

## Success Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Dashboard member count matches modal | ❌ → ✅ | Both show 1 member |
| Single source of truth | ❌ → ✅ | Only `familia_miembros` table |
| Scalable architecture | ❌ → ✅ | Proper relational design |
| All tests passing | ❌ → ✅ | 827+ tests pass |
| No regressions | ❌ → ✅ | Logging + other features work |

