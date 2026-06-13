# Fix documentosFaltantes URL Overflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 3-step chained `.in()` query in `documentosFaltantes` with a single SQL RPC that executes the join server-side, eliminating the `HeadersOverflowError` caused by passing 413+ UUIDs in a GET URL (16,294 chars > 16KB limit).

**Architecture:** Create a Supabase SQL function `get_documentos_faltantes(p_programa_id uuid)` that performs the 3-table join in one round-trip. The tRPC procedure calls `.rpc()` instead of 3 chained `.from()` queries. The existing `wrapDbError` and `adminProcedure` contracts are preserved unchanged.

**Tech Stack:** PostgreSQL (Supabase RPC), TypeScript (tRPC), Vitest

**Root Cause Evidence:**
- Error: `TypeError: fetch failed` → `HeadersOverflowError: HTTP headers exceeded server limits`
- Hint from PostgREST: `"Your request URL is 16294 characters. If filtering with large arrays (e.g., .in('id', [200+ IDs])), consider using an RPC function instead."`
- 413 active families × 36 chars/UUID + delimiters = 15,280 chars in the `.in()` value alone
- The error only occurs at step 3 (`.in('family_id', ids)`) — confirmed by log: `[reports.documentosFaltantes.docs] DB error ... TypeError: fetch failed`

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/20260610000001_get_documentos_faltantes_rpc.sql` | **Create** | SQL function that replaces the 3-query chain |
| `server/routers/reports/templated/documentosFaltantes.ts` | **Modify** | Replace 3 `.from()` queries with single `.rpc()` call |
| `server/__tests__/reports/templated-shape.test.ts` | **Modify** | Update mock to use `rpcMock` instead of 3 `fromMock` calls |

---

## Task 1: Write the failing test

**Files:**
- Modify: `server/__tests__/reports/templated-shape.test.ts` (section `// ─── 6. documentosFaltantes`)

- [ ] **Step 1: Write a failing test that asserts the RPC is called (not fromMock)**

The current test mocks `fromMock` 3 times. After the fix, the procedure must call `db.rpc("get_documentos_faltantes", ...)` instead. We need a test that:
1. Asserts `rpcMock` is called with `"get_documentos_faltantes"` and the correct `p_programa_id`
2. Asserts the result shape `{ rows: [...] }` is preserved
3. Asserts `fromMock` is NOT called (the 3-query chain is gone)

Find the existing `rpcMock` setup in the test file (used by other tests like `get_eligible_families_for_reparto`). If it doesn't exist, add it alongside `fromMock`.

Look for this pattern in `templated-shape.test.ts`:
```ts
// ─── 6. documentosFaltantes ──────────────────────────────────────────────
describe("reports.documentosFaltantes", () => {
  it("returns { rows } shape for admin with programaId", async () => {
    // documentosFaltantes makes 3 DB calls: program_document_types, families, family_member_documents
    fromMock.mockReturnValueOnce(emptyChain()); // program_document_types
    fromMock.mockReturnValueOnce(emptyChain()); // families
    fromMock.mockReturnValueOnce(emptyChain()); // family_member_documents
```

Replace with:
```ts
describe("reports.documentosFaltantes", () => {
  it("rejects voluntario with FORBIDDEN", async () => {
    // unchanged
  });
  it("calls get_documentos_faltantes RPC with p_programa_id", async () => {
    rpcResults["get_documentos_faltantes"] = [];
    const caller = documentosFaltantesRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.documentosFaltantes({
      programaId: "00000000-0000-0000-0000-000000000001",
    });
    expect(rpcCalls[0]?.name).toBe("get_documentos_faltantes");
    expect(rpcCalls[0]?.args).toMatchObject({ p_programa_id: "00000000-0000-0000-0000-000000000001" });
    expect(fromMock).not.toHaveBeenCalled();
    expect(Array.isArray(result.rows)).toBe(true);
  });
  it("maps RPC rows to { family_id, familia_numero, missing } shape", async () => {
    rpcResults["get_documentos_faltantes"] = [
      { family_id: "aaaa0000-0000-0000-0000-000000000001", familia_numero: 42, missing_slugs: ["padron", "identidad"] },
      { family_id: "bbbb0000-0000-0000-0000-000000000002", familia_numero: 7, missing_slugs: ["informe_social"] },
    ];
    const caller = documentosFaltantesRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.documentosFaltantes({
      programaId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      family_id: "aaaa0000-0000-0000-0000-000000000001",
      familia_numero: 42,
      missing: ["padron", "identidad"],
    });
    expect(result.rows[1]).toMatchObject({
      family_id: "bbbb0000-0000-0000-0000-000000000002",
      familia_numero: 7,
      missing: ["informe_social"],
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /home/ubuntu/bocatas-digital && npx vitest run server/__tests__/reports/templated-shape.test.ts 2>&1 | grep -E "FAIL|PASS|documentosFaltantes"
```

Expected: FAIL — `rpcMock` is not called because the procedure still uses `fromMock`.

---

## Task 2: Create the SQL RPC migration

**Files:**
- Create: `supabase/migrations/20260610000001_get_documentos_faltantes_rpc.sql`

- [ ] **Step 3: Write the SQL migration**

```sql
-- RPC: get_documentos_faltantes
-- Returns families that are missing at least one required document for a given programa.
-- Replaces the 3-step chained .in() queries in documentosFaltantes.ts that fail with
-- 200+ family_ids (HeadersOverflowError: URL exceeds 16KB PostgREST GET limit).
--
-- Returns one row per (family, missing_slug) pair. The TypeScript layer groups by family.
-- Output columns: family_id uuid, familia_numero integer, missing_slugs text[]
CREATE OR REPLACE FUNCTION get_documentos_faltantes(p_programa_id uuid)
RETURNS TABLE (
  family_id uuid,
  familia_numero integer,
  missing_slugs text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    f.id AS family_id,
    f.familia_numero::integer AS familia_numero,
    array_agg(pdt.slug ORDER BY pdt.slug) AS missing_slugs
  FROM families f
  CROSS JOIN (
    SELECT id, slug
    FROM program_document_types
    WHERE programa_id = p_programa_id
      AND is_required = true
      AND is_active = true
  ) pdt
  WHERE f.estado = 'activa'
    AND f.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM family_member_documents fmd
      WHERE fmd.family_id = f.id
        AND fmd.documento_tipo = pdt.slug
        AND fmd.is_current = true
        AND fmd.documento_url IS NOT NULL
        AND fmd.deleted_at IS NULL
    )
  GROUP BY f.id, f.familia_numero
  ORDER BY f.familia_numero;
$$;
```

- [ ] **Step 4: Apply the migration via webdev_execute_sql**

Execute the SQL above via `webdev_execute_sql`. Verify it returns without error.

- [ ] **Step 5: Smoke-test the RPC from Node**

```bash
cd /home/ubuntu/bocatas-digital && node -e "
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
db.rpc('get_documentos_faltantes', { p_programa_id: '00000000-0000-0000-0000-000000000001' })
  .then(({data, error}) => {
    console.log('data:', JSON.stringify(data?.slice(0,2)));
    console.log('error:', JSON.stringify(error));
  });
" 2>&1
```

Expected: `data: []` or a list of rows, `error: null`. If error contains "function does not exist", the migration was not applied.

---

## Task 3: Refactor the tRPC procedure

**Files:**
- Modify: `server/routers/reports/templated/documentosFaltantes.ts`

- [ ] **Step 6: Replace the 3-query chain with a single `.rpc()` call**

Replace the entire procedure body with:

```ts
export const documentosFaltantesRouter = router({
  documentosFaltantes: adminProcedure
    .input(InputSchema)
    .query(async ({ input }) => {
      const db = createAdminClient();

      const { data, error } = await db.rpc("get_documentos_faltantes", {
        p_programa_id: input.programaId,
      });

      if (error) {
        throw wrapDbError("reports.documentosFaltantes", error);
      }

      const rows = (data ?? []).map((row: {
        family_id: string;
        familia_numero: number;
        missing_slugs: string[];
      }) => ({
        family_id: row.family_id,
        familia_numero: row.familia_numero,
        missing: row.missing_slugs,
      }));

      return { rows };
    }),
});
```

Remove the now-unused imports: `withSoftDeleteFilter` (if no longer used in this file).

- [ ] **Step 7: Run TypeScript check**

```bash
cd /home/ubuntu/bocatas-digital && npx tsc --noEmit 2>&1 | grep "error TS" | head -10
```

Expected: 0 errors.

---

## Task 4: Make the tests pass

- [ ] **Step 8: Check if rpcMock/rpcCalls exist in templated-shape.test.ts**

```bash
grep -n "rpcMock\|rpcCalls\|rpcResults" /home/ubuntu/bocatas-digital/server/__tests__/reports/templated-shape.test.ts | head -10
```

If `rpcMock` does not exist in this test file, add it alongside `fromMock` following the pattern in `rounds-schedule.test.ts`.

- [ ] **Step 9: Update the test mock setup**

Look at how `rpcMock` is set up in `rounds-schedule.test.ts`:
```bash
grep -n "rpcMock\|rpcCalls\|rpcResults\|createAdminClient" /home/ubuntu/bocatas-digital/server/routers/families/__tests__/rounds-schedule.test.ts | head -20
```

Apply the same pattern to `templated-shape.test.ts`.

- [ ] **Step 10: Run the specific tests**

```bash
cd /home/ubuntu/bocatas-digital && npx vitest run server/__tests__/reports/templated-shape.test.ts 2>&1 | tail -10
```

Expected: All tests PASS including the 3 new `documentosFaltantes` tests.

---

## Task 5: Full suite verification

- [ ] **Step 11: Run the full test suite**

```bash
cd /home/ubuntu/bocatas-digital && npx vitest run 2>&1 | tail -8
```

Expected: All previously passing tests still pass. No regressions.

- [ ] **Step 12: Verify no fetch failed errors in dev server log**

```bash
grep "documentosFaltantes" /home/ubuntu/bocatas-digital/.manus-logs/devserver.log | tail -5
```

Expected: No new `DB error ... TypeError: fetch failed` lines after the fix.

---

## Self-Review Checklist

- [ ] SQL RPC handles the case where `program_document_types` returns 0 rows (returns empty array — verified by `CROSS JOIN` with empty set)
- [ ] SQL RPC handles the case where `families` returns 0 rows (returns empty array)
- [ ] The `missing_slugs` column is `text[]` — TypeScript maps it to `string[]` correctly
- [ ] `wrapDbError` is still used for the single RPC error path
- [ ] `adminProcedure` guard is preserved
- [ ] No PII in error messages (wrapDbError handles this)
- [ ] `withSoftDeleteFilter` import removed if no longer used (surgical change)
- [ ] The output shape `{ rows: { family_id, familia_numero, missing }[] }` is identical to before (no breaking change for the frontend)
