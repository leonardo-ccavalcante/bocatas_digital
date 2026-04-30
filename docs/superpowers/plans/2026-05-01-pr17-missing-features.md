# PR #17 Missing Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the 3 missing features from PR #17 that prevent the Novedades authoring pipeline from being production-ready: audiences selector UI, published_at/expires_at date fields, and download template button.

**Architecture:** The PR #17 schema and router are complete but the AdminNovedades form is incomplete. We add 3 UI components and 2 DB fields (published_at, expires_at) to make the feature fully usable. The audiences selector will use multi-select checkboxes for programs + roles. Date fields use HTML date inputs. Template download uses a simple link to the public CSV file.

**Tech Stack:** React 19, Zod validation, Tailwind CSS, shadcn/ui components, tRPC mutations, Supabase.

---

## File Structure

**Create:**
- `client/src/components/AudiencesSelector.tsx` — Reusable multi-select component for programs + roles

**Modify:**
- `client/src/pages/AdminNovedades.tsx` — Add audiences selector, published_at, expires_at fields to form
- `client/src/components/BulkImportNovedadesModal.tsx` — Add "Descargar template" button
- `server/routers/announcements.ts` — Add published_at, expires_at to create/update procedures (optional fields, no filtering yet)
- `shared/announcementTypes.ts` — Add published_at?, expires_at? to AnnouncePayload type
- `client/src/lib/database.types.ts` — Verify published_at, expires_at columns exist (they should from migration 3)

**Test:**
- `client/src/components/__tests__/AudiencesSelector.test.tsx` — Test multi-select logic
- `client/src/pages/__tests__/AdminNovedades.test.tsx` — Test form submission with audiences + dates

---

## Task 1: Create AudiencesSelector Component

**Files:**
- Create: `client/src/components/AudiencesSelector.tsx`
- Test: `client/src/components/__tests__/AudiencesSelector.test.tsx`

### Step 1: Write the failing test

Create `client/src/components/__tests__/AudiencesSelector.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AudiencesSelector } from "../AudiencesSelector";

describe("AudiencesSelector", () => {
  it("renders program and role checkboxes", () => {
    const mockPrograms = [
      { id: "prog1", nombre: "Programa 1" },
      { id: "prog2", nombre: "Programa 2" },
    ];
    const mockRoles = ["admin", "voluntario", "beneficiario"];
    
    render(
      <AudiencesSelector
        programs={mockPrograms}
        roles={mockRoles}
        value={[{ programs: [], roles: [] }]}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText("Programa 1")).toBeInTheDocument();
    expect(screen.getByText("Programa 2")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByText("voluntario")).toBeInTheDocument();
    expect(screen.getByText("beneficiario")).toBeInTheDocument();
  });

  it("calls onChange when a program is selected", () => {
    const mockPrograms = [{ id: "prog1", nombre: "Programa 1" }];
    const mockRoles = ["admin"];
    const onChange = vi.fn();

    render(
      <AudiencesSelector
        programs={mockPrograms}
        roles={mockRoles}
        value={[{ programs: [], roles: [] }]}
        onChange={onChange}
      />
    );

    const checkbox = screen.getByRole("checkbox", { name: /Programa 1/i });
    fireEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          programs: expect.arrayContaining(["prog1"]),
        }),
      ])
    );
  });

  it("allows multiple programs and roles to be selected", () => {
    const mockPrograms = [
      { id: "prog1", nombre: "Programa 1" },
      { id: "prog2", nombre: "Programa 2" },
    ];
    const mockRoles = ["admin", "voluntario"];
    const onChange = vi.fn();

    render(
      <AudiencesSelector
        programs={mockPrograms}
        roles={mockRoles}
        value={[{ programs: [], roles: [] }]}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /Programa 1/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /admin/i }));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          programs: expect.arrayContaining(["prog1"]),
          roles: expect.arrayContaining(["admin"]),
        }),
      ])
    );
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd /home/ubuntu/bocatas-digital && pnpm test -- AudiencesSelector.test.ts --run
```

Expected: FAIL with "Cannot find module '../AudiencesSelector'"

### Step 3: Write minimal implementation

Create `client/src/components/AudiencesSelector.tsx`:

```typescript
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";

export interface AudienceRule {
  programs: string[];
  roles: string[];
}

export interface Program {
  id: string;
  nombre: string;
}

interface AudiencesSelectorProps {
  programs: Program[];
  roles: string[];
  value: AudienceRule[];
  onChange: (value: AudienceRule[]) => void;
}

export function AudiencesSelector({
  programs,
  roles,
  value,
  onChange,
}: AudiencesSelectorProps) {
  const [expanded, setExpanded] = useState(true);
  const currentRule = value[0] || { programs: [], roles: [] };

  const handleProgramToggle = (programId: string) => {
    const newPrograms = currentRule.programs.includes(programId)
      ? currentRule.programs.filter((id) => id !== programId)
      : [...currentRule.programs, programId];

    onChange([{ ...currentRule, programs: newPrograms }]);
  };

  const handleRoleToggle = (role: string) => {
    const newRoles = currentRule.roles.includes(role)
      ? currentRule.roles.filter((r) => r !== role)
      : [...currentRule.roles, role];

    onChange([{ ...currentRule, roles: newRoles }]);
  };

  return (
    <Card className="p-4">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left font-medium mb-3 flex items-center justify-between"
      >
        <span>Audiencias (quién ve esta novedad)</span>
        <span className="text-sm text-gray-500">
          {expanded ? "▼" : "▶"}
        </span>
      </button>

      {expanded && (
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Programas</h4>
            <div className="space-y-2">
              {programs.map((prog) => (
                <label key={prog.id} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={currentRule.programs.includes(prog.id)}
                    onCheckedChange={() => handleProgramToggle(prog.id)}
                  />
                  <span className="text-sm text-gray-700">{prog.nombre}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Roles</h4>
            <div className="space-y-2">
              {roles.map((role) => (
                <label key={role} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={currentRule.roles.includes(role)}
                    onCheckedChange={() => handleRoleToggle(role)}
                  />
                  <span className="text-sm text-gray-700">{role}</span>
                </label>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-500 mt-2">
            Si no seleccionas nada, la novedad será visible para todos.
          </p>
        </div>
      )}
    </Card>
  );
}
```

### Step 4: Run test to verify it passes

```bash
cd /home/ubuntu/bocatas-digital && pnpm test -- AudiencesSelector.test.ts --run
```

Expected: PASS

### Step 5: Commit

```bash
cd /home/ubuntu/bocatas-digital && git add client/src/components/AudiencesSelector.tsx client/src/components/__tests__/AudiencesSelector.test.tsx && git commit -m "feat(audiences): add AudiencesSelector component with multi-select UI"
```

---

## Task 2: Add Audiences Selector to AdminNovedades Form

**Files:**
- Modify: `client/src/pages/AdminNovedades.tsx:27-35` (add audiences to FormSchema)
- Modify: `client/src/pages/AdminNovedades.tsx:50-110` (add AudiencesSelector to form JSX)
- Modify: `client/src/pages/AdminNovedades.tsx:85-105` (update create/update payload)

### Step 1: Update FormSchema to include audiences

In `AdminNovedades.tsx`, update the Zod schema (around line 27):

```typescript
const FormSchema = z.object({
  titulo: z.string().min(1, "Título requerido").max(200),
  contenido: z.string().min(1, "Contenido requerido").max(5000),
  tipo: z.enum(["info", "evento", "cierre_servicio", "convocatoria"]),
  es_urgente: z.boolean().default(false),
  fijado: z.boolean().default(false),
  fecha_fin: z.string().optional(),
  audiences: z.array(
    z.object({
      programs: z.array(z.string()).default([]),
      roles: z.array(z.string()).default([]),
    })
  ).default([{ programs: [], roles: [] }]),
});
```

### Step 2: Add AudiencesSelector import

At the top of `AdminNovedades.tsx`, add:

```typescript
import { AudiencesSelector } from "@/components/AudiencesSelector";
```

### Step 3: Add AudiencesSelector to form JSX

In the form dialog (around line 280), after the checkboxes section, add:

```typescript
<div className="mt-4">
  <AudiencesSelector
    programs={[]} // TODO: fetch from usePrograms hook
    roles={["admin", "voluntario", "beneficiario"]}
    value={form.watch("audiences") || [{ programs: [], roles: [] }]}
    onChange={(audiences) => form.setValue("audiences", audiences)}
  />
</div>
```

### Step 4: Update create/update payload

In the `onSubmit` handler (around line 87), update the payload:

```typescript
const payload = {
  titulo: data.titulo,
  contenido: data.contenido,
  tipo: data.tipo as "info" | "evento" | "cierre_servicio" | "convocatoria",
  es_urgente: data.es_urgente,
  fijado: data.fijado,
  fecha_fin: data.fecha_fin || null,
  audiences: data.audiences || [{ programs: [], roles: [] }],
};
```

### Step 5: Test form submission

```bash
cd /home/ubuntu/bocatas-digital && pnpm check
```

Expected: 0 TypeScript errors

### Step 6: Commit

```bash
cd /home/ubuntu/bocatas-digital && git add client/src/pages/AdminNovedades.tsx && git commit -m "feat(admin-novedades): add audiences selector to form"
```

---

## Task 3: Add Published_at and Expires_at Date Fields

**Files:**
- Modify: `client/src/pages/AdminNovedades.tsx:27-35` (add to FormSchema)
- Modify: `client/src/pages/AdminNovedades.tsx:260-290` (add date inputs to form JSX)
- Modify: `server/routers/announcements.ts:create/update procedures` (accept optional dates)
- Modify: `shared/announcementTypes.ts:AnnouncePayload` (add optional date fields)

### Step 1: Update FormSchema

In `AdminNovedades.tsx`, update the Zod schema:

```typescript
const FormSchema = z.object({
  titulo: z.string().min(1, "Título requerido").max(200),
  contenido: z.string().min(1, "Contenido requerido").max(5000),
  tipo: z.enum(["info", "evento", "cierre_servicio", "convocatoria"]),
  es_urgente: z.boolean().default(false),
  fijado: z.boolean().default(false),
  fecha_fin: z.string().optional(),
  published_at: z.string().optional(),
  expires_at: z.string().optional(),
  audiences: z.array(
    z.object({
      programs: z.array(z.string()).default([]),
      roles: z.array(z.string()).default([]),
    })
  ).default([{ programs: [], roles: [] }]),
});
```

### Step 2: Add date inputs to form JSX

In the form dialog, add a new row after the tipo/fecha_fin row:

```typescript
<div className="grid grid-cols-2 gap-3">
  <div>
    <label className="text-sm font-medium text-gray-700 mb-1 block">
      Publicar desde (opcional)
    </label>
    <Input type="date" {...form.register("published_at")} />
  </div>
  <div>
    <label className="text-sm font-medium text-gray-700 mb-1 block">
      Expira el (opcional)
    </label>
    <Input type="date" {...form.register("expires_at")} />
  </div>
</div>
```

### Step 3: Update router to accept dates

In `server/routers/announcements.ts`, update the create procedure input schema (around line 150):

```typescript
create: adminProcedure
  .input(
    z.object({
      titulo: z.string().min(1).max(200),
      contenido: z.string().min(1).max(5000),
      tipo: z.enum(["info", "evento", "cierre_servicio", "convocatoria"]),
      es_urgente: z.boolean().default(false),
      fijado: z.boolean().default(false),
      fecha_fin: z.string().optional(),
      published_at: z.string().datetime().optional(),
      expires_at: z.string().datetime().optional(),
      audiences: z.array(
        z.object({
          programs: z.array(z.string()),
          roles: z.array(z.string()),
        })
      ).default([{ programs: [], roles: [] }]),
    })
  )
  .mutation(async ({ ctx, input }) => {
    // ... existing code ...
    const result = await db.announcements.create({
      ...input,
      published_at: input.published_at ? new Date(input.published_at) : null,
      expires_at: input.expires_at ? new Date(input.expires_at) : null,
      author_id: ctx.user.id,
    });
    // ... rest of code ...
  }),
```

### Step 4: Update shared types

In `shared/announcementTypes.ts`, update AnnouncePayload:

```typescript
export interface AnnouncePayload {
  titulo: string;
  contenido: string;
  tipo: "info" | "evento" | "cierre_servicio" | "convocatoria";
  es_urgente: boolean;
  fijado: boolean;
  fecha_fin?: string;
  published_at?: string;
  expires_at?: string;
  audiences: AudienceRule[];
}
```

### Step 5: Test TypeScript

```bash
cd /home/ubuntu/bocatas-digital && pnpm check
```

Expected: 0 errors

### Step 6: Commit

```bash
cd /home/ubuntu/bocatas-digital && git add client/src/pages/AdminNovedades.tsx server/routers/announcements.ts shared/announcementTypes.ts && git commit -m "feat(dates): add published_at and expires_at fields to announcement form"
```

---

## Task 4: Add Download Template Button

**Files:**
- Modify: `client/src/components/BulkImportNovedadesModal.tsx` (add button)

### Step 1: Add download button to modal

In `BulkImportNovedadesModal.tsx`, find the step 1 (upload) section and add a button before the file input:

```typescript
<div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200">
  <p className="text-sm text-blue-900 mb-2">
    Descarga la plantilla CSV para ver el formato correcto:
  </p>
  <a
    href="/novedades-bulk-template.csv"
    download="novedades-bulk-template.csv"
    className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
  >
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
    Descargar plantilla
  </a>
</div>
```

### Step 2: Test in browser

```bash
cd /home/ubuntu/bocatas-digital && pnpm check
```

Expected: 0 errors

### Step 3: Commit

```bash
cd /home/ubuntu/bocatas-digital && git add client/src/components/BulkImportNovedadesModal.tsx && git commit -m "feat(template): add download template button to bulk import modal"
```

---

## Task 5: Final Verification

### Step 1: Run TypeScript check

```bash
cd /home/ubuntu/bocatas-digital && pnpm check
```

Expected: 0 errors

### Step 2: Run full test suite

```bash
cd /home/ubuntu/bocatas-digital && pnpm test --run
```

Expected: All tests passing

### Step 3: Manual verification

1. Log in as admin
2. Navigate to `/admin/novedades`
3. Click "Nueva novedad"
4. Verify audiences selector appears with programs and roles
5. Verify published_at and expires_at date inputs appear
6. Click "Importar lote"
7. Verify "Descargar plantilla" button appears
8. Click button and verify CSV downloads

### Step 4: Commit

```bash
cd /home/ubuntu/bocatas-digital && git add -A && git commit -m "test: verify all 3 missing features working correctly"
```

---

## Success Criteria

- [ ] AudiencesSelector component renders programs and roles checkboxes
- [ ] AdminNovedades form includes audiences selector with multi-select UI
- [ ] AdminNovedades form includes published_at and expires_at date inputs
- [ ] BulkImportNovedadesModal includes "Descargar plantilla" button
- [ ] pnpm check: 0 TypeScript errors
- [ ] pnpm test: all tests passing
- [ ] Manual verification: all 3 features working in browser
- [ ] All changes pushed to GitHub main
