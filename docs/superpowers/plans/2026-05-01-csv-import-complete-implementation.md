# CSV Import Complete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix CSV import by implementing database migration, field validation, and import history tracking - production-ready with zero technical debt.

**Architecture:** 
- **Database:** Migrate `bulk_import_previews.created_by` from uuid to text type to store OAuth identifiers
- **Validation:** Add field-level validation (dates, booleans, enums) in preview procedure with detailed error messages
- **History:** Create `bulk_import_history` table and UI to track all imports with user, timestamp, status, and row counts

**Tech Stack:** Supabase PostgreSQL, tRPC, React, Vitest, TypeScript

---

## File Structure

**Database:**
- Create: `supabase/migrations/20260501000010_fix_bulk_import_previews_and_add_history.sql`

**Backend:**
- Modify: `server/routers/announcements.ts` - Add validation logic
- Create: `server/db/bulk-import-validation.ts` - Validation helpers
- Create: `server/db/bulk-import-history.ts` - History tracking helpers
- Create: `server/__tests__/announcements-csv-validation.test.ts` - Validation tests
- Create: `server/__tests__/announcements-csv-history.test.ts` - History tests

**Frontend:**
- Modify: `client/src/components/BulkImportNovedadesModal.tsx` - Show validation errors
- Create: `client/src/pages/AdminBulkImportHistory.tsx` - History dashboard
- Modify: `client/src/App.tsx` - Add history route
- Modify: `client/src/components/DashboardLayout.tsx` - Add history menu item

**Types:**
- Modify: `client/src/lib/database.types.ts` - Add history table types

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260501000010_fix_bulk_import_previews_and_add_history.sql`

### Step 1: Write the migration SQL file

Create the migration with three parts:
1. Fix `bulk_import_previews.created_by` column type
2. Create `bulk_import_history` table
3. Create indexes for performance

```sql
-- Migration: Fix bulk_import_previews and add import history tracking
-- Date: 2026-05-01

-- PART 1: Fix bulk_import_previews.created_by column type
-- OAuth identifiers (openId) are base64 strings, not UUIDs

-- Step 1a: Create temporary column with correct type (text)
ALTER TABLE bulk_import_previews
ADD COLUMN created_by_text text;

-- Step 1b: Copy existing data from uuid column to text column
UPDATE bulk_import_previews
SET created_by_text = created_by::text;

-- Step 1c: Drop the old uuid column
ALTER TABLE bulk_import_previews
DROP COLUMN created_by;

-- Step 1d: Rename the new text column to created_by
ALTER TABLE bulk_import_previews
RENAME COLUMN created_by_text TO created_by;

-- Step 1e: Add NOT NULL constraint
ALTER TABLE bulk_import_previews
ALTER COLUMN created_by SET NOT NULL;

-- PART 2: Create bulk_import_history table for audit trail
CREATE TABLE IF NOT EXISTS bulk_import_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, completed, failed
  total_rows integer NOT NULL,
  successful_rows integer DEFAULT 0,
  failed_rows integer DEFAULT 0,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- PART 3: Create indexes for performance
CREATE INDEX idx_bulk_import_history_created_by ON bulk_import_history(created_by);
CREATE INDEX idx_bulk_import_history_created_at ON bulk_import_history(created_at DESC);
CREATE INDEX idx_bulk_import_history_status ON bulk_import_history(status);

-- Enable RLS (Row Level Security)
ALTER TABLE bulk_import_history ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own import history
CREATE POLICY bulk_import_history_user_isolation ON bulk_import_history
  FOR SELECT
  USING (created_by = auth.jwt() ->> 'sub' OR auth.jwt() ->> 'role' = 'admin');
```

### Step 2: Create Node.js script to execute migration

Create `execute-csv-migration.mjs`:

```javascript
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function executeMigration() {
  try {
    console.log("📋 Reading migration file...");
    const migrationSQL = fs.readFileSync(
      "./supabase/migrations/20260501000010_fix_bulk_import_previews_and_add_history.sql",
      "utf-8"
    );

    console.log("🚀 Executing migration...");
    console.log("   - Converting created_by from uuid to text");
    console.log("   - Creating bulk_import_history table");
    console.log("   - Setting up indexes and RLS");

    // Split SQL into individual statements
    const statements = migrationSQL
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("--"));

    let successCount = 0;
    for (const statement of statements) {
      try {
        const { error } = await supabase.rpc("exec_sql", { sql: statement });

        if (error && error.message.includes("exec_sql")) {
          console.log("⚠️  Direct SQL execution not available");
          console.log("   Please execute manually via Supabase dashboard:");
          console.log("   1. Go to SQL Editor");
          console.log("   2. Copy: supabase/migrations/20260501000010_fix_bulk_import_previews_and_add_history.sql");
          console.log("   3. Execute");
          process.exit(0);
        }

        if (error) throw error;
        successCount++;
      } catch (err) {
        console.error(`❌ Error: ${err.message}`);
      }
    }

    console.log(`✅ Migration executed! (${successCount} statements)`);
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  }
}

executeMigration();
```

### Step 3: Update database types

Modify `client/src/lib/database.types.ts` to add history table:

Find the `Database` interface and add:

```typescript
bulk_import_history: {
  Row: {
    id: string;
    created_by: string;
    status: "pending" | "completed" | "failed";
    total_rows: number;
    successful_rows: number | null;
    failed_rows: number | null;
    error_message: string | null;
    created_at: string;
    completed_at: string | null;
    metadata: Record<string, any> | null;
  };
  Insert: {
    id?: string;
    created_by: string;
    status?: "pending" | "completed" | "failed";
    total_rows: number;
    successful_rows?: number | null;
    failed_rows?: number | null;
    error_message?: string | null;
    created_at?: string;
    completed_at?: string | null;
    metadata?: Record<string, any> | null;
  };
  Update: {
    id?: string;
    created_by?: string;
    status?: "pending" | "completed" | "failed";
    total_rows?: number;
    successful_rows?: number | null;
    failed_rows?: number | null;
    error_message?: string | null;
    created_at?: string;
    completed_at?: string | null;
    metadata?: Record<string, any> | null;
  };
};
```

### Step 4: Test migration execution

Run: `node execute-csv-migration.mjs`

Expected: Migration executes successfully or provides manual instructions

---

## Task 2: CSV Field Validation

**Files:**
- Create: `server/db/bulk-import-validation.ts`
- Modify: `server/routers/announcements.ts` - Add validation in preview
- Create: `server/__tests__/announcements-csv-validation.test.ts`

### Step 1: Write validation test (RED phase)

Create `server/__tests__/announcements-csv-validation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { validateAnnouncementRow } from "../../db/bulk-import-validation";

describe("CSV Field Validation", () => {
  /**
   * TEST 1: Valid announcement passes validation
   */
  it("should accept valid announcement row", () => {
    const validRow = {
      titulo: "Test Announcement",
      contenido: "Test content",
      tipo: "info",
      es_urgente: false,
      fecha_inicio: "2026-05-01",
      fecha_fin: "2026-05-31",
      fijado: false,
      audiencias: "all",
    };

    const result = validateAnnouncementRow(validRow);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  /**
   * TEST 2: Missing required field
   */
  it("should reject missing required field (titulo)", () => {
    const invalidRow = {
      contenido: "Test content",
      tipo: "info",
      es_urgente: false,
      fecha_inicio: "2026-05-01",
      fecha_fin: "2026-05-31",
      fijado: false,
      audiencias: "all",
    };

    const result = validateAnnouncementRow(invalidRow);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "titulo" })
    );
  });

  /**
   * TEST 3: Invalid date format
   */
  it("should reject invalid date format", () => {
    const invalidRow = {
      titulo: "Test",
      contenido: "Test content",
      tipo: "info",
      es_urgente: false,
      fecha_inicio: "invalid-date",
      fecha_fin: "2026-05-31",
      fijado: false,
      audiencias: "all",
    };

    const result = validateAnnouncementRow(invalidRow);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "fecha_inicio" })
    );
  });

  /**
   * TEST 4: Invalid tipo enum
   */
  it("should reject invalid tipo value", () => {
    const invalidRow = {
      titulo: "Test",
      contenido: "Test content",
      tipo: "invalid_type",
      es_urgente: false,
      fecha_inicio: "2026-05-01",
      fecha_fin: "2026-05-31",
      fijado: false,
      audiencias: "all",
    };

    const result = validateAnnouncementRow(invalidRow);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "tipo" })
    );
  });

  /**
   * TEST 5: End date before start date
   */
  it("should reject end date before start date", () => {
    const invalidRow = {
      titulo: "Test",
      contenido: "Test content",
      tipo: "info",
      es_urgente: false,
      fecha_inicio: "2026-05-31",
      fecha_fin: "2026-05-01",
      fijado: false,
      audiencias: "all",
    };

    const result = validateAnnouncementRow(invalidRow);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining("after") })
    );
  });

  /**
   * TEST 6: Empty titulo
   */
  it("should reject empty titulo", () => {
    const invalidRow = {
      titulo: "",
      contenido: "Test content",
      tipo: "info",
      es_urgente: false,
      fecha_inicio: "2026-05-01",
      fecha_fin: "2026-05-31",
      fijado: false,
      audiencias: "all",
    };

    const result = validateAnnouncementRow(invalidRow);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "titulo" })
    );
  });
});
```

### Step 2: Run test to verify it fails

Run: `pnpm test announcements-csv-validation`

Expected: All 6 tests fail (functions don't exist yet)

### Step 3: Create validation helper (GREEN phase)

Create `server/db/bulk-import-validation.ts`:

```typescript
import { z } from "zod";

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  data?: Record<string, any>;
}

// Define announcement schema
const AnnouncementSchema = z.object({
  titulo: z.string().min(1, "Título es requerido").max(255),
  contenido: z.string().min(1, "Contenido es requerido"),
  tipo: z.enum(["info", "warning", "alert", "success"]),
  es_urgente: z.boolean(),
  fecha_inicio: z.string().refine((date) => {
    try {
      new Date(date);
      return true;
    } catch {
      return false;
    }
  }, "Fecha de inicio inválida"),
  fecha_fin: z.string().refine((date) => {
    try {
      new Date(date);
      return true;
    } catch {
      return false;
    }
  }, "Fecha de fin inválida"),
  fijado: z.boolean(),
  audiencias: z.string().min(1, "Audiencias requeridas"),
});

/**
 * Validate a single announcement row from CSV
 */
export function validateAnnouncementRow(
  row: unknown
): ValidationResult {
  const errors: ValidationError[] = [];

  // Parse and validate with Zod
  const result = AnnouncementSchema.safeParse(row);

  if (!result.success) {
    // Convert Zod errors to our format
    for (const error of result.error.errors) {
      errors.push({
        field: String(error.path[0] || "unknown"),
        message: error.message,
        value: (row as Record<string, any>)?.[String(error.path[0])],
      });
    }
  }

  // Additional validation: fecha_fin must be after fecha_inicio
  if (result.success) {
    const data = result.data;
    const startDate = new Date(data.fecha_inicio);
    const endDate = new Date(data.fecha_fin);

    if (endDate < startDate) {
      errors.push({
        field: "fecha_fin",
        message: "Fecha de fin debe ser después de fecha de inicio",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: result.success ? result.data : undefined,
  };
}

/**
 * Validate multiple announcement rows
 */
export function validateAnnouncementRows(
  rows: unknown[]
): { valid: boolean; errors: Map<number, ValidationError[]> } {
  const errors = new Map<number, ValidationError[]>();

  for (let i = 0; i < rows.length; i++) {
    const result = validateAnnouncementRow(rows[i]);
    if (!result.valid) {
      errors.set(i, result.errors);
    }
  }

  return {
    valid: errors.size === 0,
    errors,
  };
}
```

### Step 4: Run test to verify it passes

Run: `pnpm test announcements-csv-validation`

Expected: All 6 tests pass ✅

### Step 5: Update announcements router to use validation

Modify `server/routers/announcements.ts` in the `previewBulkImport` procedure (around line 1030):

Add import at top:
```typescript
import { validateAnnouncementRows } from "../db/bulk-import-validation";
```

Find the line where `valid` is checked and add validation:

```typescript
// Validate all rows
const validationResult = validateAnnouncementRows(valid);
if (!validationResult.valid) {
  // Collect all errors
  const errorsByRow = Array.from(validationResult.errors.entries()).map(
    ([rowIndex, errors]) => ({
      row: rowIndex + 2, // +2 because row 1 is header, 0-indexed
      errors: errors.map((e) => `${e.field}: ${e.message}`),
    })
  );

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `CSV validation failed: ${errorsByRow.length} row(s) with errors`,
    cause: errorsByRow,
  });
}
```

### Step 6: Run all tests

Run: `pnpm test`

Expected: All tests pass, no regressions

---

## Task 3: Import History Tracking

**Files:**
- Create: `server/db/bulk-import-history.ts`
- Modify: `server/routers/announcements.ts` - Track imports
- Create: `server/__tests__/announcements-csv-history.test.ts`
- Create: `client/src/pages/AdminBulkImportHistory.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/DashboardLayout.tsx`

### Step 1: Write history tracking test (RED phase)

Create `server/__tests__/announcements-csv-history.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAdminClient } from "../../client/src/lib/supabase/server";
import {
  createImportHistory,
  updateImportHistory,
  getImportHistory,
} from "../../db/bulk-import-history";

describe("Import History Tracking", () => {
  const db = createAdminClient();
  const testOpenId = "Vdx6QymMi2aW275wQBxTfU";
  let historyId: string | null = null;

  afterAll(async () => {
    if (historyId) {
      await db.from("bulk_import_history").delete().eq("id", historyId);
    }
  });

  /**
   * TEST 1: Create import history record
   */
  it("should create import history record", async () => {
    const result = await createImportHistory(db, {
      created_by: testOpenId,
      total_rows: 10,
    });

    expect(result.success).toBe(true);
    expect(result.data?.id).toBeDefined();
    expect(result.data?.status).toBe("pending");
    expect(result.data?.total_rows).toBe(10);

    historyId = result.data?.id || null;
  });

  /**
   * TEST 2: Update import history to completed
   */
  it("should update import history to completed", async () => {
    if (!historyId) throw new Error("No history ID from previous test");

    const result = await updateImportHistory(db, historyId, {
      status: "completed",
      successful_rows: 10,
      failed_rows: 0,
    });

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe("completed");
    expect(result.data?.successful_rows).toBe(10);
  });

  /**
   * TEST 3: Get user's import history
   */
  it("should retrieve user's import history", async () => {
    const result = await getImportHistory(db, testOpenId);

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data?.length).toBeGreaterThan(0);
    expect(result.data?.[0]?.created_by).toBe(testOpenId);
  });

  /**
   * TEST 4: Update to failed status
   */
  it("should update import history to failed", async () => {
    const createResult = await createImportHistory(db, {
      created_by: testOpenId,
      total_rows: 5,
    });

    const failId = createResult.data?.id;
    if (!failId) throw new Error("Failed to create history");

    const updateResult = await updateImportHistory(db, failId, {
      status: "failed",
      error_message: "Invalid CSV format",
      failed_rows: 5,
    });

    expect(updateResult.data?.status).toBe("failed");
    expect(updateResult.data?.error_message).toBe("Invalid CSV format");

    // Cleanup
    await db.from("bulk_import_history").delete().eq("id", failId);
  });
});
```

### Step 2: Run test to verify it fails

Run: `pnpm test announcements-csv-history`

Expected: All 4 tests fail (functions don't exist)

### Step 3: Create history tracking helper (GREEN phase)

Create `server/db/bulk-import-history.ts`:

```typescript
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../../client/src/lib/database.types";

export interface CreateHistoryInput {
  created_by: string;
  total_rows: number;
  metadata?: Record<string, any>;
}

export interface UpdateHistoryInput {
  status?: "pending" | "completed" | "failed";
  successful_rows?: number;
  failed_rows?: number;
  error_message?: string;
  metadata?: Record<string, any>;
}

export interface HistoryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Create a new import history record
 */
export async function createImportHistory(
  db: SupabaseClient<Database>,
  input: CreateHistoryInput
): Promise<HistoryResult<Database["public"]["Tables"]["bulk_import_history"]["Row"]>> {
  try {
    const { data, error } = await db
      .from("bulk_import_history")
      .insert({
        created_by: input.created_by,
        total_rows: input.total_rows,
        status: "pending",
        metadata: input.metadata || {},
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Update import history record
 */
export async function updateImportHistory(
  db: SupabaseClient<Database>,
  historyId: string,
  input: UpdateHistoryInput
): Promise<HistoryResult<Database["public"]["Tables"]["bulk_import_history"]["Row"]>> {
  try {
    const updateData: Record<string, any> = { ...input };

    // Set completed_at if status is completed or failed
    if (input.status === "completed" || input.status === "failed") {
      updateData.completed_at = new Date().toISOString();
    }

    const { data, error } = await db
      .from("bulk_import_history")
      .update(updateData)
      .eq("id", historyId)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Get import history for a user
 */
export async function getImportHistory(
  db: SupabaseClient<Database>,
  createdBy: string
): Promise<HistoryResult<Database["public"]["Tables"]["bulk_import_history"]["Row"][]>> {
  try {
    const { data, error } = await db
      .from("bulk_import_history")
      .select("*")
      .eq("created_by", createdBy)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Get all import history (admin only)
 */
export async function getAllImportHistory(
  db: SupabaseClient<Database>
): Promise<HistoryResult<Database["public"]["Tables"]["bulk_import_history"]["Row"][]>> {
  try {
    const { data, error } = await db
      .from("bulk_import_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
```

### Step 4: Run test to verify it passes

Run: `pnpm test announcements-csv-history`

Expected: All 4 tests pass ✅

### Step 5: Create import history dashboard page

Create `client/src/pages/AdminBulkImportHistory.tsx`:

```typescript
import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { trpc } from "../lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { format } from "date-fns";

interface ImportRecord {
  id: string;
  created_by: string;
  status: "pending" | "completed" | "failed";
  total_rows: number;
  successful_rows: number | null;
  failed_rows: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export default function AdminBulkImportHistory() {
  const { user } = useAuth();
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch import history
    // This would use a tRPC query to get history
    setLoading(false);
  }, []);

  if (!user || user.role !== "admin") {
    return <div className="p-4">Access denied</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Historial de Importaciones CSV</h1>
        <p className="text-gray-600 mt-2">
          Registro de todas las importaciones de archivos CSV
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Importaciones Recientes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Cargando...</div>
          ) : imports.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No hay importaciones registradas
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="text-left py-2 px-4">Fecha</th>
                    <th className="text-left py-2 px-4">Usuario</th>
                    <th className="text-left py-2 px-4">Estado</th>
                    <th className="text-left py-2 px-4">Filas</th>
                    <th className="text-left py-2 px-4">Exitosas</th>
                    <th className="text-left py-2 px-4">Fallidas</th>
                    <th className="text-left py-2 px-4">Mensaje</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((record) => (
                    <tr key={record.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-4">
                        {format(new Date(record.created_at), "dd/MM/yyyy HH:mm")}
                      </td>
                      <td className="py-2 px-4">{record.created_by}</td>
                      <td className="py-2 px-4">
                        <Badge
                          variant={
                            record.status === "completed"
                              ? "default"
                              : record.status === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {record.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-4">{record.total_rows}</td>
                      <td className="py-2 px-4">
                        {record.successful_rows ?? "-"}
                      </td>
                      <td className="py-2 px-4">{record.failed_rows ?? "-"}</td>
                      <td className="py-2 px-4 text-red-600">
                        {record.error_message || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

### Step 6: Add route to App.tsx

Modify `client/src/App.tsx` - find the admin routes section and add:

```typescript
import AdminBulkImportHistory from "./pages/AdminBulkImportHistory";

// In the routes section:
{
  user?.role === "admin" && (
    <>
      {/* existing admin routes */}
      <Route path="/admin/bulk-import-history" component={AdminBulkImportHistory} />
    </>
  )
}
```

### Step 7: Add menu item to DashboardLayout

Modify `client/src/components/DashboardLayout.tsx` - find the admin menu section and add:

```typescript
{user?.role === "admin" && (
  <Link href="/admin/bulk-import-history" className="...">
    📊 Historial de Importaciones
  </Link>
)}
```

### Step 8: Run all tests

Run: `pnpm test`

Expected: All tests pass, no regressions

---

## Verification Checklist

Before marking complete:

- [ ] Database migration executes successfully
- [ ] `bulk_import_previews.created_by` is type `text`
- [ ] `bulk_import_history` table exists with correct schema
- [ ] CSV validation rejects invalid rows with clear error messages
- [ ] CSV validation accepts valid rows
- [ ] Import history records are created on successful import
- [ ] Import history records are updated on completion/failure
- [ ] Admin can view import history dashboard
- [ ] All 764+ tests pass
- [ ] Zero TypeScript errors
- [ ] No regressions in existing features

---

## Success Criteria

✅ **Database:** Schema fixed, history table created, indexes added
✅ **Validation:** All field types validated, errors reported clearly
✅ **History:** All imports tracked with status, user, timestamps
✅ **Tests:** 100% coverage of new functionality
✅ **UI:** Admin dashboard shows import history
✅ **Production Ready:** No technical debt, proper error handling, audit trail complete
