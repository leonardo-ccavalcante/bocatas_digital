# Soft-Delete Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement comprehensive soft-delete architecture with schema audit, cascade rules, and admin data recovery UI for production-ready data management.

**Architecture:** Three-layer approach: (1) Database schema audit to identify all soft-delete requirements, (2) Cascade rules to maintain referential integrity when records are soft-deleted, (3) Admin UI to view and restore soft-deleted records with full audit trail.

**Tech Stack:** PostgreSQL (Supabase), tRPC, React, TypeScript, Vitest, Drizzle ORM

---

## File Structure

**New Files:**
- `server/db/soft-delete-audit.ts` - Schema audit utilities
- `server/db/soft-delete-cascade.ts` - Cascade rule implementation
- `server/routers/admin/soft-delete-recovery.ts` - tRPC procedures for recovery
- `client/src/pages/AdminSoftDeleteRecovery.tsx` - Recovery UI component
- `client/src/components/SoftDeleteRecoveryTable.tsx` - Reusable recovery table
- `server/__tests__/soft-delete-cascade.test.ts` - Cascade rule tests
- `server/__tests__/soft-delete-recovery.test.ts` - Recovery procedure tests
- `docs/DATABASE_SOFT_DELETE_ARCHITECTURE.md` - Architecture documentation

**Modified Files:**
- `server/routers.ts` - Add admin soft-delete recovery router
- `client/src/App.tsx` - Add recovery page route
- `client/src/components/DashboardLayout.tsx` - Add recovery menu item
- `drizzle/schema.ts` - Verify all tables have deleted_at columns

---

## Task 1: Database Schema Audit

**Files:**
- Create: `server/db/soft-delete-audit.ts`
- Modify: `drizzle/schema.ts`
- Test: `server/__tests__/soft-delete-audit.test.ts`

### Step 1.1: Write failing test for schema audit

```typescript
// server/__tests__/soft-delete-audit.test.ts
import { describe, it, expect } from "vitest";
import { auditSoftDeleteSchema } from "../db/soft-delete-audit";

describe("Soft-Delete Schema Audit", () => {
  it("identifies all tables with soft-delete requirements", async () => {
    const audit = await auditSoftDeleteSchema();
    
    // Tables that MUST have deleted_at
    const requiredTables = [
      "families",
      "familia_miembros",
      "persons",
      "programs",
      "announcements",
      "entregas",
      "family_documents",
    ];
    
    for (const table of requiredTables) {
      const result = audit.find(t => t.tableName === table);
      expect(result).toBeDefined();
      expect(result?.hasDeletedAt).toBe(true);
      expect(result?.hasIndex).toBe(true);
    }
  });

  it("identifies tables missing deleted_at column", async () => {
    const audit = await auditSoftDeleteSchema();
    const missing = audit.filter(t => !t.hasDeletedAt && t.requiresDeletedAt);
    
    // Should be empty after fix
    expect(missing).toHaveLength(0);
  });

  it("verifies deleted_at indexes exist for performance", async () => {
    const audit = await auditSoftDeleteSchema();
    const withoutIndex = audit.filter(t => t.hasDeletedAt && !t.hasIndex);
    
    // Should be empty after fix
    expect(withoutIndex).toHaveLength(0);
  });

  it("generates migration SQL for missing columns", async () => {
    const audit = await auditSoftDeleteSchema();
    const migrations = audit
      .filter(t => !t.hasDeletedAt && t.requiresDeletedAt)
      .map(t => t.migrationSQL);
    
    // Each migration should be valid SQL
    for (const sql of migrations) {
      expect(sql).toContain("ALTER TABLE");
      expect(sql).toContain("ADD COLUMN");
      expect(sql).toContain("deleted_at");
    }
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `pnpm test server/__tests__/soft-delete-audit.test.ts -v`
Expected: FAIL with "auditSoftDeleteSchema is not defined"

- [ ] **Step 1.3: Implement schema audit utility**

```typescript
// server/db/soft-delete-audit.ts
import { createClient } from "@supabase/supabase-js";

export interface TableAudit {
  tableName: string;
  hasDeletedAt: boolean;
  hasIndex: boolean;
  requiresDeletedAt: boolean;
  migrationSQL: string;
  status: "compliant" | "missing-column" | "missing-index";
}

const SOFT_DELETE_REQUIRED_TABLES = [
  "families",
  "familia_miembros",
  "persons",
  "programs",
  "announcements",
  "entregas",
  "family_documents",
  "documento_extranjero",
  "programa_participante",
];

export async function auditSoftDeleteSchema(): Promise<TableAudit[]> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const db = createClient(supabaseUrl, supabaseServiceKey);

  const results: TableAudit[] = [];

  for (const tableName of SOFT_DELETE_REQUIRED_TABLES) {
    // Check if table exists and has deleted_at column
    const { data: columns, error } = await db.rpc("get_table_columns", {
      table_name: tableName,
    });

    if (error) {
      console.error(`Error checking table ${tableName}:`, error);
      continue;
    }

    const hasDeletedAt = columns?.some((c: any) => c.column_name === "deleted_at");
    const hasIndex = await checkIndexExists(db, tableName, "deleted_at");

    const status = !hasDeletedAt
      ? "missing-column"
      : !hasIndex
        ? "missing-index"
        : "compliant";

    const migrationSQL = !hasDeletedAt
      ? `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_${tableName}_deleted_at ON ${tableName}(deleted_at);`
      : !hasIndex
        ? `CREATE INDEX IF NOT EXISTS idx_${tableName}_deleted_at ON ${tableName}(deleted_at);`
        : "";

    results.push({
      tableName,
      hasDeletedAt: !!hasDeletedAt,
      hasIndex,
      requiresDeletedAt: true,
      migrationSQL,
      status,
    });
  }

  return results;
}

async function checkIndexExists(
  db: ReturnType<typeof createClient>,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const indexName = `idx_${tableName}_${columnName}`;
  const { data, error } = await db.rpc("index_exists", {
    index_name: indexName,
  });

  if (error) return false;
  return !!data;
}

export async function generateMigrationScript(): Promise<string> {
  const audit = await auditSoftDeleteSchema();
  const migrations = audit
    .filter(t => t.migrationSQL)
    .map(t => t.migrationSQL)
    .join("\n\n");

  return `-- Auto-generated soft-delete schema migrations
-- Generated: ${new Date().toISOString()}

${migrations}

-- Verification query: Check all tables have deleted_at
SELECT table_name, column_name 
FROM information_schema.columns 
WHERE table_name IN (${SOFT_DELETE_REQUIRED_TABLES.map(t => `'${t}'`).join(",")})
AND column_name = 'deleted_at'
ORDER BY table_name;`;
}
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `pnpm test server/__tests__/soft-delete-audit.test.ts -v`
Expected: PASS

- [ ] **Step 1.5: Verify all required tables have deleted_at columns**

Run: `node -e "import('./server/db/soft-delete-audit.ts').then(m => m.auditSoftDeleteSchema().then(r => console.table(r)))"`
Expected: All tables show `hasDeletedAt: true`, `status: "compliant"`

- [ ] **Step 1.6: Commit**

```bash
git add server/db/soft-delete-audit.ts server/__tests__/soft-delete-audit.test.ts
git commit -m "feat: add soft-delete schema audit utility"
```

---

## Task 2: Soft-Delete Cascade Rules

**Files:**
- Create: `server/db/soft-delete-cascade.ts`
- Create: `server/__tests__/soft-delete-cascade.test.ts`
- Modify: `server/routers/families.ts` (add cascade logic)

### Step 2.1: Write failing test for cascade rules

```typescript
// server/__tests__/soft-delete-cascade.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { softDeleteWithCascade } from "../db/soft-delete-cascade";

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describe("Soft-Delete Cascade Rules", () => {
  let testFamilyId: string;
  let testMemberId: string;
  let db: ReturnType<typeof createClient>;

  beforeAll(async () => {
    db = createClient(supabaseUrl, supabaseServiceKey);

    // Create test family
    const { data: familyData } = await db
      .from("families")
      .insert({ familia_numero: 99999, estado: "activa" })
      .select()
      .single();

    testFamilyId = familyData.id;

    // Create test member
    const { data: memberData } = await db
      .from("familia_miembros")
      .insert({
        familia_id: testFamilyId,
        nombre: "Test Member",
        rol: "titular",
        deleted_at: null,
      })
      .select()
      .single();

    testMemberId = memberData.id;
  });

  afterAll(async () => {
    // Hard delete test data
    await db.from("familia_miembros").delete().eq("id", testMemberId);
    await db.from("families").delete().eq("id", testFamilyId);
  });

  it("soft-deletes family and cascades to members", async () => {
    // Soft delete family
    await softDeleteWithCascade(db, "families", testFamilyId);

    // Verify family is soft-deleted
    const { data: family } = await db
      .from("families")
      .select("deleted_at")
      .eq("id", testFamilyId)
      .single();

    expect(family.deleted_at).not.toBeNull();

    // Verify members are also soft-deleted
    const { data: members } = await db
      .from("familia_miembros")
      .select("deleted_at")
      .eq("familia_id", testFamilyId);

    expect(members).toHaveLength(1);
    expect(members[0].deleted_at).not.toBeNull();
  });

  it("preserves deletion timestamp for audit trail", async () => {
    const beforeDelete = new Date();
    await softDeleteWithCascade(db, "families", testFamilyId);
    const afterDelete = new Date();

    const { data: family } = await db
      .from("families")
      .select("deleted_at")
      .eq("id", testFamilyId)
      .single();

    const deletedAt = new Date(family.deleted_at);
    expect(deletedAt.getTime()).toBeGreaterThanOrEqual(beforeDelete.getTime());
    expect(deletedAt.getTime()).toBeLessThanOrEqual(afterDelete.getTime());
  });

  it("does not hard-delete records", async () => {
    // Soft delete
    await softDeleteWithCascade(db, "families", testFamilyId);

    // Record should still exist in database
    const { data: family, error } = await db
      .from("families")
      .select("id")
      .eq("id", testFamilyId)
      .single();

    expect(error).toBeNull();
    expect(family).toBeDefined();
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `pnpm test server/__tests__/soft-delete-cascade.test.ts -v`
Expected: FAIL with "softDeleteWithCascade is not defined"

- [ ] **Step 2.3: Implement cascade logic**

```typescript
// server/db/soft-delete-cascade.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CascadeRule {
  parentTable: string;
  childTable: string;
  foreignKeyColumn: string;
  parentIdColumn: string;
}

const CASCADE_RULES: CascadeRule[] = [
  {
    parentTable: "families",
    childTable: "familia_miembros",
    foreignKeyColumn: "familia_id",
    parentIdColumn: "id",
  },
  {
    parentTable: "families",
    childTable: "entregas",
    foreignKeyColumn: "familia_id",
    parentIdColumn: "id",
  },
  {
    parentTable: "families",
    childTable: "family_documents",
    foreignKeyColumn: "familia_id",
    parentIdColumn: "id",
  },
  {
    parentTable: "persons",
    childTable: "programa_participante",
    foreignKeyColumn: "persona_id",
    parentIdColumn: "id",
  },
  {
    parentTable: "programs",
    childTable: "programa_participante",
    foreignKeyColumn: "programa_id",
    parentIdColumn: "id",
  },
];

export async function softDeleteWithCascade(
  db: SupabaseClient,
  tableName: string,
  recordId: string
): Promise<void> {
  const now = new Date().toISOString();

  // Soft delete the parent record
  const { error: parentError } = await db
    .from(tableName)
    .update({ deleted_at: now })
    .eq("id", recordId);

  if (parentError) {
    throw new Error(
      `Failed to soft-delete ${tableName} ${recordId}: ${parentError.message}`
    );
  }

  // Find and cascade to child records
  const applicableRules = CASCADE_RULES.filter(r => r.parentTable === tableName);

  for (const rule of applicableRules) {
    // Get all child records
    const { data: childRecords, error: selectError } = await db
      .from(rule.childTable)
      .select("id")
      .eq(rule.foreignKeyColumn, recordId)
      .is("deleted_at", null); // Only cascade to non-deleted records

    if (selectError) {
      console.error(
        `Failed to fetch ${rule.childTable} records for cascade:`,
        selectError
      );
      continue;
    }

    if (childRecords && childRecords.length > 0) {
      // Soft delete all child records
      const { error: updateError } = await db
        .from(rule.childTable)
        .update({ deleted_at: now })
        .eq(rule.foreignKeyColumn, recordId)
        .is("deleted_at", null);

      if (updateError) {
        console.error(
          `Failed to cascade soft-delete to ${rule.childTable}:`,
          updateError
        );
      }
    }
  }
}

export async function restoreWithCascade(
  db: SupabaseClient,
  tableName: string,
  recordId: string
): Promise<void> {
  // Restore the parent record
  const { error: parentError } = await db
    .from(tableName)
    .update({ deleted_at: null })
    .eq("id", recordId);

  if (parentError) {
    throw new Error(
      `Failed to restore ${tableName} ${recordId}: ${parentError.message}`
    );
  }

  // Restore child records that were deleted at the same time
  const { data: parentRecord, error: selectError } = await db
    .from(tableName)
    .select("deleted_at")
    .eq("id", recordId)
    .single();

  if (selectError || !parentRecord) {
    console.error("Failed to fetch parent record for cascade restore");
    return;
  }

  const applicableRules = CASCADE_RULES.filter(r => r.parentTable === tableName);

  for (const rule of applicableRules) {
    // Restore child records (optional: only those deleted around same time)
    const { error: updateError } = await db
      .from(rule.childTable)
      .update({ deleted_at: null })
      .eq(rule.foreignKeyColumn, recordId)
      .not("deleted_at", "is", null);

    if (updateError) {
      console.error(
        `Failed to cascade restore to ${rule.childTable}:`,
        updateError
      );
    }
  }
}

export function getCascadeRules(tableName: string): CascadeRule[] {
  return CASCADE_RULES.filter(r => r.parentTable === tableName);
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `pnpm test server/__tests__/soft-delete-cascade.test.ts -v`
Expected: PASS

- [ ] **Step 2.5: Add cascade logic to families router**

Modify `server/routers/families.ts` to use cascade on delete:

```typescript
// In families router, modify the delete procedure:
deleteFamilyWithCascade: protectedProcedure
  .input(z.object({ familyId: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    // Only admins can delete
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const { familyId } = input;
    
    // Import at top: import { softDeleteWithCascade } from "../db/soft-delete-cascade";
    await softDeleteWithCascade(db, "families", familyId);

    return { success: true, familyId };
  }),
```

- [ ] **Step 2.6: Commit**

```bash
git add server/db/soft-delete-cascade.ts server/__tests__/soft-delete-cascade.test.ts server/routers/families.ts
git commit -m "feat: implement soft-delete cascade rules for referential integrity"
```

---

## Task 3: Data Recovery Admin UI - Backend

**Files:**
- Create: `server/routers/admin/soft-delete-recovery.ts`
- Create: `server/__tests__/soft-delete-recovery.test.ts`
- Modify: `server/routers.ts` (add recovery router)

### Step 3.1: Write failing test for recovery procedures

```typescript
// server/__tests__/soft-delete-recovery.test.ts
import { describe, it, expect } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-user",
      email: "admin@test.com",
      name: "Admin User",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Soft-Delete Recovery Procedures", () => {
  const caller = appRouter.createCaller(createAdminContext());

  it("lists soft-deleted families with metadata", async () => {
    const result = await caller.admin.softDelete.listDeletedFamilies({
      limit: 10,
      offset: 0,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.items[0]).toHaveProperty("id");
    expect(result.items[0]).toHaveProperty("deleted_at");
    expect(result.items[0]).toHaveProperty("familia_numero");
  });

  it("shows deletion audit trail", async () => {
    const result = await caller.admin.softDelete.getDeletedFamilyDetails({
      familyId: "test-id",
    });

    expect(result).toBeDefined();
    expect(result).toHaveProperty("family");
    expect(result).toHaveProperty("deletedMembers");
    expect(result).toHaveProperty("deletedDocuments");
    expect(result.family).toHaveProperty("deleted_at");
  });

  it("restores soft-deleted family with cascade", async () => {
    const result = await caller.admin.softDelete.restoreFamily({
      familyId: "test-id",
    });

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.restoredCount).toBeGreaterThanOrEqual(1);
  });

  it("requires admin role for recovery operations", async () => {
    const userContext: TrpcContext = {
      user: {
        id: 2,
        openId: "user",
        email: "user@test.com",
        name: "Regular User",
        loginMethod: "manus",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    };

    const userCaller = appRouter.createCaller(userContext);

    await expect(
      userCaller.admin.softDelete.listDeletedFamilies({ limit: 10, offset: 0 })
    ).rejects.toThrow("FORBIDDEN");
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

Run: `pnpm test server/__tests__/soft-delete-recovery.test.ts -v`
Expected: FAIL with "admin.softDelete is not defined"

- [ ] **Step 3.3: Implement recovery procedures**

```typescript
// server/routers/admin/soft-delete-recovery.ts
import { protectedProcedure, router } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { restoreWithCascade } from "../../db/soft-delete-cascade";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

export const softDeleteRecoveryRouter = router({
  listDeletedFamilies: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        search: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      let query = db
        .from("families")
        .select("id, familia_numero, estado, deleted_at, updated_at", {
          count: "exact",
        })
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      if (input.search) {
        query = query.or(
          `familia_numero.ilike.%${input.search}%,estado.ilike.%${input.search}%`
        );
      }

      const { data, count, error } = await query
        .range(input.offset, input.offset + input.limit - 1);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return {
        items: data || [],
        total: count || 0,
        limit: input.limit,
        offset: input.offset,
      };
    }),

  getDeletedFamilyDetails: adminProcedure
    .input(z.object({ familyId: z.string().uuid() }))
    .query(async ({ input }) => {
      const db = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Get family
      const { data: family, error: familyError } = await db
        .from("families")
        .select("*")
        .eq("id", input.familyId)
        .single();

      if (familyError || !family) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Family not found",
        });
      }

      // Get deleted members
      const { data: deletedMembers } = await db
        .from("familia_miembros")
        .select("id, nombre, rol, deleted_at")
        .eq("familia_id", input.familyId)
        .not("deleted_at", "is", null);

      // Get deleted documents
      const { data: deletedDocuments } = await db
        .from("family_documents")
        .select("id, nombre, tipo, deleted_at")
        .eq("familia_id", input.familyId)
        .not("deleted_at", "is", null);

      // Get deleted deliveries
      const { data: deletedDeliveries } = await db
        .from("entregas")
        .select("id, fecha, estado, deleted_at")
        .eq("familia_id", input.familyId)
        .not("deleted_at", "is", null);

      return {
        family,
        deletedMembers: deletedMembers || [],
        deletedDocuments: deletedDocuments || [],
        deletedDeliveries: deletedDeliveries || [],
        totalDeleted:
          (deletedMembers?.length || 0) +
          (deletedDocuments?.length || 0) +
          (deletedDeliveries?.length || 0),
      };
    }),

  restoreFamily: adminProcedure
    .input(z.object({ familyId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const db = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      try {
        // Restore family and cascade
        await restoreWithCascade(db, "families", input.familyId);

        // Count restored records
        const { data: family } = await db
          .from("families")
          .select("id")
          .eq("id", input.familyId)
          .single();

        const { data: members } = await db
          .from("familia_miembros")
          .select("id")
          .eq("familia_id", input.familyId);

        return {
          success: true,
          familyId: input.familyId,
          restoredCount: 1 + (members?.length || 0),
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to restore family: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  listDeletedPersons: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data, count, error } = await db
        .from("persons")
        .select("id, nombre, apellido, deleted_at, updated_at", {
          count: "exact",
        })
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return {
        items: data || [],
        total: count || 0,
      };
    }),

  restorePerson: adminProcedure
    .input(z.object({ personId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const db = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      try {
        await restoreWithCascade(db, "persons", input.personId);

        return {
          success: true,
          personId: input.personId,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to restore person: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),
});
```

- [ ] **Step 3.4: Add recovery router to main router**

Modify `server/routers.ts`:

```typescript
// At top of file, add import:
import { softDeleteRecoveryRouter } from "./admin/soft-delete-recovery";

// In appRouter definition, add:
admin: router({
  softDelete: softDeleteRecoveryRouter,
  // ... other admin routers
}),
```

- [ ] **Step 3.5: Run test to verify it passes**

Run: `pnpm test server/__tests__/soft-delete-recovery.test.ts -v`
Expected: PASS

- [ ] **Step 3.6: Commit**

```bash
git add server/routers/admin/soft-delete-recovery.ts server/__tests__/soft-delete-recovery.test.ts server/routers.ts
git commit -m "feat: add soft-delete recovery tRPC procedures with admin authorization"
```

---

## Task 4: Data Recovery Admin UI - Frontend

**Files:**
- Create: `client/src/pages/AdminSoftDeleteRecovery.tsx`
- Create: `client/src/components/SoftDeleteRecoveryTable.tsx`
- Modify: `client/src/App.tsx` (add route)
- Modify: `client/src/components/DashboardLayout.tsx` (add menu item)

### Step 4.1: Write failing test for recovery UI component

```typescript
// client/src/components/__tests__/SoftDeleteRecoveryTable.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SoftDeleteRecoveryTable } from "../SoftDeleteRecoveryTable";

describe("SoftDeleteRecoveryTable", () => {
  it("renders deleted families list", () => {
    const mockFamilies = [
      {
        id: "1",
        familia_numero: 100,
        estado: "activa",
        deleted_at: "2026-05-01T10:00:00Z",
        updated_at: "2026-05-01T10:00:00Z",
      },
    ];

    render(
      <SoftDeleteRecoveryTable
        items={mockFamilies}
        type="families"
        onRestore={() => {}}
        isLoading={false}
      />
    );

    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("activa")).toBeInTheDocument();
  });

  it("shows restore button for each item", () => {
    const mockFamilies = [
      {
        id: "1",
        familia_numero: 100,
        estado: "activa",
        deleted_at: "2026-05-01T10:00:00Z",
        updated_at: "2026-05-01T10:00:00Z",
      },
    ];

    render(
      <SoftDeleteRecoveryTable
        items={mockFamilies}
        type="families"
        onRestore={() => {}}
        isLoading={false}
      />
    );

    expect(screen.getByRole("button", { name: /restore/i })).toBeInTheDocument();
  });

  it("calls onRestore when restore button clicked", async () => {
    const onRestore = vi.fn();
    const mockFamilies = [
      {
        id: "1",
        familia_numero: 100,
        estado: "activa",
        deleted_at: "2026-05-01T10:00:00Z",
        updated_at: "2026-05-01T10:00:00Z",
      },
    ];

    const { user } = render(
      <SoftDeleteRecoveryTable
        items={mockFamilies}
        type="families"
        onRestore={onRestore}
        isLoading={false}
      />
    );

    await user.click(screen.getByRole("button", { name: /restore/i }));
    expect(onRestore).toHaveBeenCalledWith("1");
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

Run: `pnpm test client/src/components/__tests__/SoftDeleteRecoveryTable.test.tsx -v`
Expected: FAIL with "SoftDeleteRecoveryTable is not defined"

- [ ] **Step 4.3: Implement recovery table component**

```typescript
// client/src/components/SoftDeleteRecoveryTable.tsx
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, RotateCcw } from "lucide-react";

interface DeletedRecord {
  id: string;
  deleted_at: string;
  updated_at: string;
  [key: string]: any;
}

interface SoftDeleteRecoveryTableProps {
  items: DeletedRecord[];
  type: "families" | "persons";
  onRestore: (id: string) => Promise<void>;
  isLoading: boolean;
}

export function SoftDeleteRecoveryTable({
  items,
  type,
  onRestore,
  isLoading,
}: SoftDeleteRecoveryTableProps) {
  const [restoring, setRestoring] = React.useState<string | null>(null);

  const handleRestore = async (id: string) => {
    setRestoring(id);
    try {
      await onRestore(id);
    } finally {
      setRestoring(null);
    }
  };

  const columns = type === "families" 
    ? ["Familia #", "Estado", "Eliminado", "Acciones"]
    : ["Nombre", "Apellido", "Eliminado", "Acciones"];

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map(col => (
              <TableHead key={col}>{col}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">
                No hay registros eliminados
              </TableCell>
            </TableRow>
          ) : (
            items.map(item => (
              <TableRow key={item.id}>
                {type === "families" ? (
                  <>
                    <TableCell>{item.familia_numero}</TableCell>
                    <TableCell>{item.estado}</TableCell>
                    <TableCell>
                      {format(new Date(item.deleted_at), "PPpp", { locale: es })}
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell>{item.nombre}</TableCell>
                    <TableCell>{item.apellido}</TableCell>
                    <TableCell>
                      {format(new Date(item.deleted_at), "PPpp", { locale: es })}
                    </TableCell>
                  </>
                )}
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRestore(item.id)}
                    disabled={restoring === item.id || isLoading}
                  >
                    {restoring === item.id ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Restaurando...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Restaurar
                      </>
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 4.4: Implement recovery page**

```typescript
// client/src/pages/AdminSoftDeleteRecovery.tsx
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { SoftDeleteRecoveryTable } from "@/components/SoftDeleteRecoveryTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function AdminSoftDeleteRecovery() {
  const [familiesPage, setFamiliesPage] = useState(0);
  const [personsPage, setPersonsPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  const deletedFamiliesQuery = trpc.admin.softDelete.listDeletedFamilies.useQuery({
    limit: 20,
    offset: familiesPage * 20,
    search: searchQuery,
  });

  const deletedPersonsQuery = trpc.admin.softDelete.listDeletedPersons.useQuery({
    limit: 20,
    offset: personsPage * 20,
  });

  const restoreFamilyMutation = trpc.admin.softDelete.restoreFamily.useMutation({
    onSuccess: () => {
      deletedFamiliesQuery.refetch();
    },
  });

  const restorePersonMutation = trpc.admin.softDelete.restorePerson.useMutation({
    onSuccess: () => {
      deletedPersonsQuery.refetch();
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Recuperación de Registros Eliminados</h1>
        <p className="text-muted-foreground mt-2">
          Ver y restaurar registros que han sido eliminados (soft-delete)
        </p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Los registros eliminados se mantienen en la base de datos para auditoría. Puede restaurarlos aquí.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="families" className="w-full">
        <TabsList>
          <TabsTrigger value="families">
            Familias ({deletedFamiliesQuery.data?.total || 0})
          </TabsTrigger>
          <TabsTrigger value="persons">
            Personas ({deletedPersonsQuery.data?.total || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="families" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Familias Eliminadas</CardTitle>
              <CardDescription>
                Buscar y restaurar familias eliminadas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Buscar por número de familia..."
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setFamiliesPage(0);
                }}
              />

              <SoftDeleteRecoveryTable
                items={deletedFamiliesQuery.data?.items || []}
                type="families"
                onRestore={id => restoreFamilyMutation.mutateAsync({ familyId: id })}
                isLoading={deletedFamiliesQuery.isLoading}
              />

              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  Página {familiesPage + 1} de{" "}
                  {Math.ceil((deletedFamiliesQuery.data?.total || 0) / 20)}
                </p>
                <div className="space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => setFamiliesPage(p => Math.max(0, p - 1))}
                    disabled={familiesPage === 0}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setFamiliesPage(p => p + 1)}
                    disabled={
                      familiesPage >=
                      Math.ceil((deletedFamiliesQuery.data?.total || 0) / 20) - 1
                    }
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="persons" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Personas Eliminadas</CardTitle>
              <CardDescription>
                Ver y restaurar personas eliminadas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SoftDeleteRecoveryTable
                items={deletedPersonsQuery.data?.items || []}
                type="persons"
                onRestore={id => restorePersonMutation.mutateAsync({ personId: id })}
                isLoading={deletedPersonsQuery.isLoading}
              />

              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  Página {personsPage + 1} de{" "}
                  {Math.ceil((deletedPersonsQuery.data?.total || 0) / 20)}
                </p>
                <div className="space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => setPersonsPage(p => Math.max(0, p - 1))}
                    disabled={personsPage === 0}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setPersonsPage(p => p + 1)}
                    disabled={
                      personsPage >=
                      Math.ceil((deletedPersonsQuery.data?.total || 0) / 20) - 1
                    }
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 4.5: Add route to App.tsx**

Modify `client/src/App.tsx`:

```typescript
// Add import:
import { AdminSoftDeleteRecovery } from "@/pages/AdminSoftDeleteRecovery";

// In routes, add:
{
  path: "/admin/soft-delete-recovery",
  component: AdminSoftDeleteRecovery,
}
```

- [ ] **Step 4.6: Add menu item to DashboardLayout**

Modify `client/src/components/DashboardLayout.tsx` to add navigation item:

```typescript
// In the sidebar navigation, add:
<Link to="/admin/soft-delete-recovery" className="flex items-center gap-2 px-4 py-2 rounded hover:bg-accent">
  <RotateCcw className="w-4 h-4" />
  <span>Recuperar Registros</span>
</Link>
```

- [ ] **Step 4.7: Run tests to verify they pass**

Run: `pnpm test client/src/components/__tests__/SoftDeleteRecoveryTable.test.tsx -v`
Expected: PASS

- [ ] **Step 4.8: Run full test suite**

Run: `pnpm test -v`
Expected: All tests pass (755+ tests)

- [ ] **Step 4.9: Commit**

```bash
git add client/src/pages/AdminSoftDeleteRecovery.tsx client/src/components/SoftDeleteRecoveryTable.tsx client/src/App.tsx client/src/components/DashboardLayout.tsx
git commit -m "feat: add admin UI for soft-delete data recovery"
```

---

## Task 5: Documentation and Verification

**Files:**
- Create: `docs/DATABASE_SOFT_DELETE_ARCHITECTURE.md`
- Modify: `DATABASE_SCHEMA_FIX.md` (add reference)

### Step 5.1: Write architecture documentation

```markdown
// docs/DATABASE_SOFT_DELETE_ARCHITECTURE.md
# Soft-Delete Architecture Documentation

## Overview

This document describes the comprehensive soft-delete architecture implemented in Bocatas Digital, including schema requirements, cascade rules, and data recovery procedures.

## Schema Requirements

All tables that track entity lifecycles MUST have a `deleted_at` column:

- `families` - Family records
- `familia_miembros` - Family members
- `persons` - Person records
- `programs` - Program records
- `announcements` - Announcements
- `entregas` - Deliveries
- `family_documents` - Family documents
- `documento_extranjero` - Foreign documents
- `programa_participante` - Program participants

## Cascade Rules

When a parent record is soft-deleted, all child records are automatically soft-deleted:

- `families` → `familia_miembros`, `entregas`, `family_documents`
- `persons` → `programa_participante`
- `programs` → `programa_participante`

## Data Recovery

Admins can view and restore soft-deleted records via `/admin/soft-delete-recovery`:

1. Navigate to "Recuperar Registros" in admin dashboard
2. Select tab (Familias or Personas)
3. Click "Restaurar" to restore a record
4. All cascaded deletes are also restored

## Audit Trail

All soft-delete operations preserve:
- `deleted_at` timestamp (when deleted)
- Original record data (for recovery)
- Cascade relationships (for complete restoration)

## Implementation Details

See `server/db/soft-delete-cascade.ts` for cascade logic
See `server/routers/admin/soft-delete-recovery.ts` for recovery procedures
```

- [ ] **Step 5.2: Run full verification**

Run: `pnpm test && pnpm build`
Expected: All tests pass, build succeeds

- [ ] **Step 5.3: Verify schema audit passes**

Run: `node -e "import('./server/db/soft-delete-audit.ts').then(m => m.auditSoftDeleteSchema().then(r => console.table(r.filter(t => !t.hasDeletedAt)))).catch(console.error)"`
Expected: Empty array (no missing columns)

- [ ] **Step 5.4: Commit documentation**

```bash
git add docs/DATABASE_SOFT_DELETE_ARCHITECTURE.md DATABASE_SCHEMA_FIX.md
git commit -m "docs: add soft-delete architecture documentation"
```

---

## Success Criteria

- [ ] All 755+ tests passing
- [ ] Zero TypeScript errors
- [ ] Schema audit shows all tables compliant
- [ ] Cascade rules tested and verified
- [ ] Recovery UI accessible to admins only
- [ ] No collateral breakage
- [ ] Code review approved
- [ ] QA verification complete

---

## Rollback Plan

If critical issues discovered:

```bash
git revert <commit-hash>
webdev_rollback_checkpoint <previous-version>
```

---

## Deployment Checklist

- [ ] All tests passing
- [ ] Code review approved
- [ ] QA verification complete
- [ ] Backup database before deployment
- [ ] Run schema audit in production
- [ ] Monitor for errors post-deployment
- [ ] Document any issues found
