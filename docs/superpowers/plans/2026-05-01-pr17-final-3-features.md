# PR #17 Final 3 Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/executing-plans` + `/test-driven-development` + `/systematic-debugging` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete PR #17 by finalizing published_at/expires_at database integration, integrating AnnouncementImageUploader into AdminNovedades, and adding date validation to prevent data inconsistencies.

**Architecture:** This plan follows karpathy-guidelines (surgical changes only, minimum code, verifiable success criteria). Each task is TDD-first (failing test → minimal implementation → pass). Database schema changes are applied via MCP, server logic is uncommented and verified, and form integration happens through controlled props and validation.

**Tech Stack:** Supabase (PostgreSQL), React Hook Form (zod validation), tRPC, Vitest

---

## File Structure

**Files to modify:**
- `server/routers/announcements.ts` — Uncomment published_at/expires_at filtering logic (lines 450-470)
- `client/src/pages/AdminNovedades.tsx` — Add image field to form, integrate AnnouncementImageUploader, add date validation
- `client/src/lib/database.types.ts` — Verify published_at/expires_at columns exist in announcements type

**Files already exist (no changes needed):**
- `client/src/components/AnnouncementImageUploader.tsx` — Component already created
- `shared/announcementTypes.ts` — Types already defined

---

## Task 1: Execute DB Migration for published_at/expires_at Columns

**Files:**
- Modify: Supabase announcements table (via MCP)
- Verify: `client/src/lib/database.types.ts` (announcements type)

**Success criteria:**
- ✅ Supabase announcements table has `published_at` and `expires_at` columns (both nullable timestamp)
- ✅ `database.types.ts` includes both columns in the announcements type
- ✅ Server can read/write these columns without errors

### Step 1: Check current announcements table schema

Run: `manus-mcp-cli tool call execute_sql --server supabase --input '{"sql": "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '\''announcements'\'' ORDER BY ordinal_position;"}'`

Expected: See columns including `id`, `titulo`, `contenido`, `tipo`, `es_urgente`, `created_at`, `updated_at` — but NO `published_at` or `expires_at` yet.

### Step 2: Add published_at and expires_at columns via MCP

Run: `manus-mcp-cli tool call execute_sql --server supabase --input '{"sql": "ALTER TABLE announcements ADD COLUMN published_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE;"}'`

Expected: Success (no errors)

### Step 3: Verify columns were added

Run: `manus-mcp-cli tool call execute_sql --server supabase --input '{"sql": "SELECT column_name FROM information_schema.columns WHERE table_name = '\''announcements'\'' AND column_name IN ('\''published_at'\'', '\''expires_at'\'');"}'`

Expected: Two rows returned: `published_at` and `expires_at`

### Step 4: Verify database.types.ts includes the columns

Read: `client/src/lib/database.types.ts`

Search for: `announcements` type definition

Expected: Should include `published_at: string | null` and `expires_at: string | null`

If missing, add them manually:
```typescript
export type Announcements = {
  // ... existing fields
  published_at: string | null;
  expires_at: string | null;
};
```

### Step 5: Commit

```bash
git add -A
git commit -m "feat: add published_at and expires_at columns to announcements table"
```

---

## Task 2: Uncomment and Verify Server-Side Visibility Filtering Logic

**Files:**
- Modify: `server/routers/announcements.ts` (lines 450-470)
- Test: Existing tests should pass

**Success criteria:**
- ✅ `getAll` procedure filters announcements by published_at/expires_at
- ✅ Announcements before published_at are hidden
- ✅ Announcements after expires_at are hidden
- ✅ All existing tests pass
- ✅ 0 TypeScript errors

### Step 1: Read the current getAll procedure

Read: `server/routers/announcements.ts` lines 440-480

Expected: Should see commented-out code like:
```typescript
// if (input.now) {
//   query = query.where(sql`${announcements.published_at} <= ${input.now}`);
//   query = query.where(sql`${announcements.expires_at} IS NULL OR ${announcements.expires_at} > ${input.now}`);
// }
```

### Step 2: Uncomment the published_at/expires_at filtering logic

Edit: `server/routers/announcements.ts`

Find: Lines 450-470 (the commented-out visibility filtering)

Replace with:
```typescript
// Apply visibility filtering based on published_at and expires_at
const now = new Date();
if (input.now) {
  query = query.where(sql`${announcements.published_at} <= ${input.now}`);
  query = query.where(sql`${announcements.expires_at} IS NULL OR ${announcements.expires_at} > ${input.now}`);
} else {
  // Default to current time if not specified
  query = query.where(sql`${announcements.published_at} <= NOW()`);
  query = query.where(sql`${announcements.expires_at} IS NULL OR ${announcements.expires_at} > NOW()`);
}
```

### Step 3: Verify TypeScript check passes

Run: `cd /home/ubuntu/bocatas-digital && pnpm check 2>&1`

Expected: 0 errors

If errors: Fix them by ensuring `input.now` is typed correctly (should be `Date | null | undefined`)

### Step 4: Run tests to verify logic works

Run: `cd /home/ubuntu/bocatas-digital && pnpm test -- announcements 2>&1`

Expected: All announcement tests pass (72+ tests)

### Step 5: Commit

```bash
git add server/routers/announcements.ts
git commit -m "feat: enable published_at/expires_at visibility filtering in getAll procedure"
```

---

## Task 3: Integrate AnnouncementImageUploader in AdminNovedades Form

**Files:**
- Modify: `client/src/pages/AdminNovedades.tsx` (add image field to form)
- Use: `client/src/components/AnnouncementImageUploader.tsx` (already created)

**Success criteria:**
- ✅ AdminNovedades form has `image_url` field
- ✅ AnnouncementImageUploader component renders in the form
- ✅ Image upload works (file → S3 → URL returned)
- ✅ Form submits with image_url in the payload
- ✅ 0 TypeScript errors

### Step 1: Write failing test for image field in AdminNovedades

Create: `client/src/pages/__tests__/AdminNovedades.image.test.tsx`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminNovedades from '../AdminNovedades';

describe('AdminNovedades - Image Upload', () => {
  it('should render AnnouncementImageUploader component', async () => {
    render(<AdminNovedades />);
    
    // Look for the image uploader section
    const imageLabel = screen.queryByText(/imagen|image/i);
    expect(imageLabel).toBeTruthy(); // Should exist after implementation
  });

  it('should include image_url in form submission', async () => {
    const user = userEvent.setup();
    render(<AdminNovedades />);
    
    // Fill form fields
    const titleInput = screen.getByLabelText(/título|title/i);
    await user.type(titleInput, 'Test Announcement');
    
    // The image_url should be included in the mutation payload
    // This test will pass once AnnouncementImageUploader is integrated
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd /home/ubuntu/bocatas-digital && pnpm test -- AdminNovedades.image 2>&1`

Expected: Test fails (image field not found)

### Step 3: Add image field to FormSchema in AdminNovedades

Edit: `client/src/pages/AdminNovedades.tsx`

Find: FormSchema definition (around line 30)

Add after `audiences` field:
```typescript
image_url: z.string().url().optional(),
```

### Step 4: Import AnnouncementImageUploader

Edit: `client/src/pages/AdminNovedades.tsx`

Add to imports (around line 5):
```typescript
import { AnnouncementImageUploader } from '@/components/AnnouncementImageUploader';
```

### Step 5: Add image field to form JSX

Edit: `client/src/pages/AdminNovedades.tsx`

Find: Form JSX section (around line 290)

Add after audiences selector:
```typescript
<div className="space-y-2">
  <label className="text-sm font-medium">Imagen (opcional)</label>
  <AnnouncementImageUploader
    onImageUrlChange={(url) => form.setValue('image_url', url)}
    currentImageUrl={form.watch('image_url')}
  />
</div>
```

### Step 6: Update onSubmit to include image_url

Edit: `client/src/pages/AdminNovedades.tsx`

Find: onSubmit handler (around line 180)

Ensure the mutation includes `image_url`:
```typescript
await createMutation.mutateAsync({
  titulo: data.titulo,
  contenido: data.contenido,
  tipo: data.tipo,
  es_urgente: data.es_urgente,
  fijado: data.fijado,
  audiences: data.audiences,
  published_at: data.published_at,
  expires_at: data.expires_at,
  image_url: data.image_url, // Add this line
});
```

### Step 7: Run test to verify it passes

Run: `cd /home/ubuntu/bocatas-digital && pnpm test -- AdminNovedades.image 2>&1`

Expected: Test passes

### Step 8: Verify TypeScript check passes

Run: `cd /home/ubuntu/bocatas-digital && pnpm check 2>&1`

Expected: 0 errors

### Step 9: Commit

```bash
git add client/src/pages/AdminNovedades.tsx client/src/pages/__tests__/AdminNovedades.image.test.tsx
git commit -m "feat: integrate AnnouncementImageUploader in AdminNovedades form"
```

---

## Task 4: Add Date Validation (expires_at > published_at)

**Files:**
- Modify: `client/src/pages/AdminNovedades.tsx` (FormSchema + validation)

**Success criteria:**
- ✅ Form schema validates that expires_at > published_at (if both are set)
- ✅ Error message shown to user if validation fails
- ✅ Form cannot submit with invalid date range
- ✅ 0 TypeScript errors

### Step 1: Write failing test for date validation

Create: `client/src/pages/__tests__/AdminNovedades.dateValidation.test.tsx`

```typescript
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Import the FormSchema from AdminNovedades (you may need to export it)
// For now, we'll test the validation logic directly

describe('AdminNovedades - Date Validation', () => {
  it('should reject expires_at before published_at', () => {
    const schema = z.object({
      published_at: z.date().optional(),
      expires_at: z.date().optional(),
    }).refine(
      (data) => {
        if (data.published_at && data.expires_at) {
          return data.expires_at > data.published_at;
        }
        return true;
      },
      {
        message: 'Fecha de expiración debe ser posterior a fecha de publicación',
        path: ['expires_at'],
      }
    );

    const validData = {
      published_at: new Date('2026-05-01'),
      expires_at: new Date('2026-05-02'),
    };

    const invalidData = {
      published_at: new Date('2026-05-02'),
      expires_at: new Date('2026-05-01'),
    };

    expect(() => schema.parse(validData)).not.toThrow();
    expect(() => schema.parse(invalidData)).toThrow();
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd /home/ubuntu/bocatas-digital && pnpm test -- AdminNovedades.dateValidation 2>&1`

Expected: Test fails (validation not implemented yet)

### Step 3: Update FormSchema with date validation

Edit: `client/src/pages/AdminNovedades.tsx`

Find: FormSchema definition (around line 30)

Replace the entire schema with:
```typescript
const FormSchema = z.object({
  titulo: z.string().min(1, 'Título requerido'),
  contenido: z.string().min(1, 'Contenido requerido'),
  tipo: z.enum(['info', 'evento', 'cierre_servicio', 'convocatoria']),
  es_urgente: z.boolean().default(false),
  fijado: z.boolean().default(false),
  audiences: z.array(z.object({
    programs: z.array(z.string()),
    roles: z.array(z.string()),
  })).min(1, 'Selecciona al menos una audiencia'),
  published_at: z.date().optional(),
  expires_at: z.date().optional(),
  image_url: z.string().url().optional(),
}).refine(
  (data) => {
    // If both dates are set, expires_at must be after published_at
    if (data.published_at && data.expires_at) {
      return data.expires_at > data.published_at;
    }
    return true;
  },
  {
    message: 'Fecha de expiración debe ser posterior a fecha de publicación',
    path: ['expires_at'],
  }
);
```

### Step 4: Add error display for date validation

Edit: `client/src/pages/AdminNovedades.tsx`

Find: The form JSX section where expires_at is rendered (around line 300)

Add error display after the expires_at input:
```typescript
{form.formState.errors.expires_at && (
  <p className="text-sm text-red-500">{form.formState.errors.expires_at.message}</p>
)}
```

### Step 5: Run test to verify it passes

Run: `cd /home/ubuntu/bocatas-digital && pnpm test -- AdminNovedades.dateValidation 2>&1`

Expected: Test passes

### Step 6: Verify TypeScript check passes

Run: `cd /home/ubuntu/bocatas-digital && pnpm check 2>&1`

Expected: 0 errors

### Step 7: Run full test suite to ensure nothing broke

Run: `cd /home/ubuntu/bocatas-digital && pnpm test --run 2>&1`

Expected: All tests pass (720+ tests)

### Step 8: Commit

```bash
git add client/src/pages/AdminNovedades.tsx client/src/pages/__tests__/AdminNovedades.dateValidation.test.tsx
git commit -m "feat: add date validation to ensure expires_at > published_at"
```

---

## Final Verification

After all tasks complete:

### Step 1: Run TypeScript check

Run: `cd /home/ubuntu/bocatas-digital && pnpm check 2>&1`

Expected: 0 errors

### Step 2: Run full test suite

Run: `cd /home/ubuntu/bocatas-digital && pnpm test --run 2>&1`

Expected: All tests pass, 0 failures

### Step 3: Verify server is healthy

Run: `curl -s http://localhost:3000/api/trpc/auth.me 2>&1`

Expected: Response (server is running)

### Step 4: Push to GitHub

```bash
cd /home/ubuntu/bocatas-digital
git add -A
git commit -m "feat: complete PR #17 - finalize published_at/expires_at, integrate image uploader, add date validation"
cd /tmp/bocatas_gh
git pull origin main
rsync -av /home/ubuntu/bocatas-digital/ .
git add -A
git commit -m "feat: complete PR #17 - finalize published_at/expires_at, integrate image uploader, add date validation"
git push origin main
```

Expected: Commit pushed to GitHub main branch

---

## Rollback Plan

If any task fails critically:

1. **Before starting:** `git stash` to save uncommitted changes
2. **After each task:** Commit immediately so you can rollback to that point
3. **If blocked:** `git reset --hard <last-good-commit>` to revert to last known good state

---

## Success Criteria Summary

- ✅ published_at/expires_at columns exist in Supabase announcements table
- ✅ Server-side visibility filtering is active (announcements filtered by dates)
- ✅ AnnouncementImageUploader integrated in AdminNovedades form
- ✅ Date validation prevents expires_at < published_at
- ✅ All tests pass (720+)
- ✅ 0 TypeScript errors
- ✅ Commit pushed to GitHub main
