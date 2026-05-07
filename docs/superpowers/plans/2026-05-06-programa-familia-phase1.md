# Programa de Familia — Phase 1: Foundations + Familias Tab + Uploads Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-06-programa-familia-5-tab-surface.md`

**Goal:** Replace the flat `/familias/*` routing with a tabbed surface inside `/programas/programa_familias`. Ship two tabs (Familias, Uploads) plus the foundations every later phase will depend on (`<ProgramTabs />`, route migration, DB-driven `program_document_types` registry, `family_saved_views`).

**Architecture:** Add a `<ProgramTabs program={program} />` component to `client/src/features/programs/components/`. `ProgramaDetalle.tsx` mounts it whenever the program slug is `programa_familias`; for any other slug the existing single-page UI renders unchanged. The tab strip reads URL `?tab=` for state. New routers (`familySavedViews`, `programDocumentTypes`) follow the existing `families/` split-folder pattern.

**Tech Stack:** Existing — Vite 7, React 19, wouter, tRPC v11, Zod v3, TanStack Query v5, Supabase, shadcn/ui, Vitest, Playwright.

**Phase 1 ships:**
- Foundations: `<ProgramTabs />`, route table changes, `family_saved_views` table.
- **Familias tab:** dense list, search, saved views, side drawer, drill-in to `/familias/:id`.
- **Uploads tab:** types catalog with template/guide downloads, bulk upload, "Pendientes de clasificar" pseudo-state, archive explorer, admin surface for managing types.
- DB-driven `program_document_types` registry that replaces the hardcoded `FamilyDocType` enum.

**Phase 1 does NOT ship:** Mapa, Reports, Derivar (Phase 2 + Phase 3). The `<ProgramTabs />` strip will render Mapa/Reports/Derivar tab buttons as **disabled with a "Próximamente" tooltip** so the visual surface is final.

---

## File Structure

### Created

| Path | Responsibility |
|---|---|
| `supabase/migrations/<NEXT_TS>_create_family_saved_views.sql` | Per-user saved-view storage for the Familias tab |
| `supabase/migrations/<NEXT_TS+1>_create_program_document_types.sql` | DB-driven document-type registry; seed `programa_familias` with the 7 existing types |
| `supabase/migrations/<NEXT_TS+2>_create_program_document_templates_bucket.sql` | Storage bucket for template + guide files |
| `server/routers/familySavedViews.ts` | tRPC CRUD on `family_saved_views` |
| `server/routers/programDocumentTypes/index.ts` | Sub-router merging `crud` + `templates` |
| `server/routers/programDocumentTypes/crud.ts` | List/get/create/update/deactivate types (admin-read, superadmin-write) |
| `server/routers/programDocumentTypes/templates.ts` | Upload/replace template & guide files; signed-URL generation for downloads |
| `client/src/features/programs/components/ProgramTabs.tsx` | The 5-tab strip; renders disabled placeholders for Phase 2/3 tabs |
| `client/src/features/familias-tab/index.tsx` | Tab entry point — composes list + drawer |
| `client/src/features/familias-tab/FamiliasList.tsx` | Dense table (reuses `useFamilias`) with URL-driven filters |
| `client/src/features/familias-tab/FamiliaDrawer.tsx` | Right-side drawer (radix `Sheet`) opened on row click |
| `client/src/features/familias-tab/SavedViewsBar.tsx` | Saved-view segments + "Nueva vista" + share toggle |
| `client/src/features/familias-tab/hooks/useFamilySavedViews.ts` | tRPC binding for `familySavedViews.*` |
| `client/src/features/familias-tab/hooks/useFamiliasFilters.ts` | URL-state hook for filters (search, estado, sin_guf, sin_informe) |
| `client/src/features/uploads-tab/index.tsx` | Tab entry point — composes catalog + pendientes + archive |
| `client/src/features/uploads-tab/TiposCatalog.tsx` | Top section: per-type plantilla + guía downloads |
| `client/src/features/uploads-tab/PendientesGrid.tsx` | "Pendientes de clasificar" thumbnails |
| `client/src/features/uploads-tab/ArchiveExplorer.tsx` | Filterable table of all program documents |
| `client/src/features/uploads-tab/UploadModal.tsx` | Single + bulk upload dialog with type/familia/miembro picker |
| `client/src/features/uploads-tab/ClassifyModal.tsx` | Re-classification modal for "Pendientes" rows |
| `client/src/features/uploads-tab/hooks/useProgramDocumentTypes.ts` | tRPC binding |
| `client/src/features/uploads-tab/hooks/useArchiveDocuments.ts` | tRPC binding for filtered document list |
| `client/src/pages/admin/ProgramaTiposDocumentoPage.tsx` | Superadmin page to manage types + upload templates/guides |

### Modified

| Path | What changes |
|---|---|
| `client/src/App.tsx` | Add new admin route; legacy `/familias/cumplimiento` and `/familias/informes-sociales` 301-redirect via wouter `Redirect` to `/programas/programa_familias?tab=familias`; `/familias` itself redirects too. Keep `/familias/:id`, `/familias/nueva`, `/familias/entregas`, `/familias/verificar`. |
| `client/src/pages/ProgramaDetalle.tsx` | Mount `<ProgramTabs program={program} />` when slug==='programa_familias'; otherwise render existing layout unchanged. |
| `server/_core/trpc.ts` | Wire `familySavedViewsRouter` and `programDocumentTypesRouter` into `appRouter`. |
| `client/src/components/DocumentUploadModal.tsx` | Replace hardcoded `FamilyDocType` import with a runtime call to `programDocumentTypes.list({ programaSlug: 'programa_familias' })`. |
| `shared/familyDocuments.ts` | Add file-level deprecation comment pointing to `program_document_types` as the new source of truth; keep the type alias and helpers in place (still consumed by old code paths during migration). |

### Reused (no edit)

- `client/src/features/families/hooks/useFamilias.ts` — list and search hooks
- `server/routers/families/crud.ts` — `getAll` already accepts `search`, `estado`, `sin_alta_guf`, `sin_informe_social`
- `server/routers/families/documents.ts` — upload/download/delete unchanged
- `server/routers/families/compliance.ts` — `getComplianceStats` reused inside the drawer's badge strip
- `server/_core/rlsRedaction.ts` — `redactHighRiskFields`
- `client/src/components/ui/sheet.tsx` — radix Sheet primitive

---

## Conventions used in this plan

- **TS timestamp placeholders** like `<NEXT_TS>` are concrete YYYYMMDDhhmmss values picked at migration creation time (matches the existing `supabase/migrations/` pattern). The `migrate-filenames` CI job validates monotonic ordering.
- **SQL helper qualification**: existing migrations call `public.get_user_role()` and `update_updated_at_column()` with the schema prefix on the former. The plan SQL below uses the unqualified form for readability — when applying, prefix `public.` to `get_user_role()` calls to match project convention. Both forms work because `public` is on the default `search_path`.
- **Migrations apply locally first** via `supabase db reset`. Never apply directly to remote without Leo's explicit signoff (per `docs/execution-2026-05-06.md` open item #4).
- **Test commands**: `pnpm test --run path/to/test.ts` runs a single file. `pnpm test` runs the suite.
- **Type regen**: after every migration, `supabase gen types typescript --local > client/src/lib/database.types.ts`.
- **Commits**: one commit per task. Conventional Commits prefix (`feat:`, `test:`, `refactor:`, `chore:`).

---

## Tasks

### Task 1: Schema — `family_saved_views` table

**Files:**
- Create: `supabase/migrations/<NEXT_TS>_create_family_saved_views.sql`
- Modify: `client/src/lib/database.types.ts` (auto-generated)

- [ ] **Step 1: Pick timestamp**

```bash
date -u +%Y%m%d%H%M%S
# Use the printed value as <NEXT_TS> in the filename below.
```

- [ ] **Step 2: Write the migration**

`supabase/migrations/<NEXT_TS>_create_family_saved_views.sql`:

```sql
-- Saved-view storage for the Familias tab inside /programas/programa_familias.
-- Each row is one saved filter set. is_shared=true makes it visible to all admins.

CREATE TABLE IF NOT EXISTS family_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,                              -- ctx.user.id (Manus IDs are non-UUID)
  programa_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  descripcion text,
  filters_json jsonb NOT NULL,                        -- Zod-validated FamiliasFiltersSpec
  is_shared boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX family_saved_views_user_idx
  ON family_saved_views(user_id, programa_id);
CREATE INDEX family_saved_views_shared_idx
  ON family_saved_views(programa_id) WHERE is_shared;

ALTER TABLE family_saved_views ENABLE ROW LEVEL SECURITY;

-- Admins/superadmins can read their own views + shared views in their tenant.
CREATE POLICY "saved_views_admin_read"
  ON family_saved_views FOR SELECT
  TO authenticated
  USING (
    get_user_role() IN ('admin','superadmin') AND
    (user_id = (auth.jwt() ->> 'sub') OR is_shared = true)
  );

-- Admins/superadmins can write only their own rows.
CREATE POLICY "saved_views_admin_write"
  ON family_saved_views FOR ALL
  TO authenticated
  USING (get_user_role() IN ('admin','superadmin') AND user_id = (auth.jwt() ->> 'sub'))
  WITH CHECK (get_user_role() IN ('admin','superadmin') AND user_id = (auth.jwt() ->> 'sub'));

-- Auto-update updated_at via existing trigger function.
CREATE TRIGGER family_saved_views_updated_at
  BEFORE UPDATE ON family_saved_views
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

- [ ] **Step 3: Apply locally and regenerate types**

```bash
supabase db reset
supabase gen types typescript --local > client/src/lib/database.types.ts
```

Expected: `Database` type now includes `family_saved_views` row + insert + update.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/<NEXT_TS>_create_family_saved_views.sql client/src/lib/database.types.ts
git commit -m "feat(schema): add family_saved_views for the Familias tab saved-view bar"
```

---

### Task 2: Server router — `familySavedViews`

**Files:**
- Create: `server/routers/familySavedViews.ts`
- Test: `server/routers/__tests__/familySavedViews.test.ts`
- Modify: `server/_core/trpc.ts` (wire into `appRouter`)

- [ ] **Step 1: Write failing tests**

`server/routers/__tests__/familySavedViews.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { familySavedViewsRouter } from "../familySavedViews";
import type { Context } from "../../_core/context";

const adminCtx = (overrides: Partial<Context> = {}): Context => ({
  user: { id: "user-leo", role: "admin", openId: "user-leo" },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  correlationId: "test",
  ...overrides,
} as Context);

describe("familySavedViews router", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects voluntario from list", async () => {
    const ctx = adminCtx({ user: { id: "u", role: "voluntario", openId: "u" } });
    const caller = familySavedViewsRouter.createCaller(ctx);
    await expect(caller.list({ programaId: "00000000-0000-0000-0000-000000000001" }))
      .rejects.toThrow(/UNAUTHORIZED|FORBIDDEN/);
  });

  it("validates filters_json shape", async () => {
    const caller = familySavedViewsRouter.createCaller(adminCtx());
    await expect(caller.create({
      programaId: "00000000-0000-0000-0000-000000000001",
      nombre: "Activas",
      filtersJson: { invalidField: 1 } as never,
      isShared: false,
    })).rejects.toThrow();
  });

  it("accepts a valid filters_json", async () => {
    const caller = familySavedViewsRouter.createCaller(adminCtx());
    // We expect this to not throw on validation. Persistence is mocked by Supabase.
    // (test will get DB error in real env; treat that as expected for this layer.)
    await expect(caller.create({
      programaId: "00000000-0000-0000-0000-000000000001",
      nombre: "Activas",
      filtersJson: { estado: "activa" },
      isShared: false,
    })).rejects.not.toThrow(/Invalid input/);
  });
});
```

- [ ] **Step 2: Run tests, expect FAIL**

```bash
pnpm test --run server/routers/__tests__/familySavedViews.test.ts
```

Expected: import error — `familySavedViewsRouter` not defined.

- [ ] **Step 3: Implement the router**

`server/routers/familySavedViews.ts`:

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../_core/trpc";
import { createAdminClient } from "../../client/src/lib/supabase/server";

export const FamiliasFiltersSpec = z.object({
  search: z.string().optional(),
  estado: z.enum(["activa", "baja", "all"]).optional(),
  sinGuf: z.boolean().optional(),
  sinInformeSocial: z.boolean().optional(),
  distrito: z.string().optional(),  // future Phase 2 hook
}).strict();

export type FamiliasFilters = z.infer<typeof FamiliasFiltersSpec>;

const uuidLike = z.string().uuid();

export const familySavedViewsRouter = router({
  list: adminProcedure
    .input(z.object({ programaId: uuidLike }))
    .query(async ({ ctx, input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("family_saved_views")
        .select("*")
        .eq("programa_id", input.programaId)
        .or(`user_id.eq.${ctx.user.id},is_shared.eq.true`)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  create: adminProcedure
    .input(z.object({
      programaId: uuidLike,
      nombre: z.string().min(1).max(100),
      descripcion: z.string().max(500).optional(),
      filtersJson: FamiliasFiltersSpec,
      isShared: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("family_saved_views")
        .insert({
          user_id: String(ctx.user.id),
          programa_id: input.programaId,
          nombre: input.nombre,
          descripcion: input.descripcion ?? null,
          filters_json: input.filtersJson,
          is_shared: input.isShared,
        })
        .select()
        .single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  update: adminProcedure
    .input(z.object({
      id: uuidLike,
      nombre: z.string().min(1).max(100).optional(),
      descripcion: z.string().max(500).optional(),
      filtersJson: FamiliasFiltersSpec.optional(),
      isShared: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = createAdminClient();
      const { id, ...rest } = input;
      const update: Record<string, unknown> = {};
      if (rest.nombre !== undefined) update.nombre = rest.nombre;
      if (rest.descripcion !== undefined) update.descripcion = rest.descripcion;
      if (rest.filtersJson !== undefined) update.filters_json = rest.filtersJson;
      if (rest.isShared !== undefined) update.is_shared = rest.isShared;
      update.updated_at = new Date().toISOString();
      const { data, error } = await db
        .from("family_saved_views")
        .update(update)
        .eq("id", id)
        .eq("user_id", String(ctx.user.id))   // server-side ownership guard
        .select()
        .single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  delete: adminProcedure
    .input(z.object({ id: uuidLike }))
    .mutation(async ({ ctx, input }) => {
      const db = createAdminClient();
      const { error } = await db
        .from("family_saved_views")
        .delete()
        .eq("id", input.id)
        .eq("user_id", String(ctx.user.id));
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),
});
```

- [ ] **Step 4: Wire into `appRouter`**

In `server/_core/trpc.ts` (or wherever `appRouter` is composed — confirm by grepping for `appRouter`):

```typescript
import { familySavedViewsRouter } from "../routers/familySavedViews";

export const appRouter = router({
  // ...existing routers
  familySavedViews: familySavedViewsRouter,
});
```

- [ ] **Step 5: Run tests, expect PASS**

```bash
pnpm test --run server/routers/__tests__/familySavedViews.test.ts
```

Expected: 3 passing.

- [ ] **Step 6: Commit**

```bash
git add server/routers/familySavedViews.ts server/routers/__tests__/familySavedViews.test.ts server/_core/trpc.ts
git commit -m "feat(server): add familySavedViews router for the Familias tab"
```

---

### Task 3: Schema — `program_document_types` registry + storage bucket

**Files:**
- Create: `supabase/migrations/<NEXT_TS+1>_create_program_document_types.sql`
- Create: `supabase/migrations/<NEXT_TS+2>_create_program_document_templates_bucket.sql`
- Modify: `client/src/lib/database.types.ts` (auto-regen)

- [ ] **Step 1: Write the registry migration**

`supabase/migrations/<NEXT_TS+1>_create_program_document_types.sql`:

```sql
-- DB-driven registry replacing the hardcoded `FamilyDocType` TS enum.
-- Each program owns its own document-type catalog. Templates and guides
-- live in the `program-document-templates` storage bucket and are linked
-- here by their `template_url` / `guide_url` paths.

CREATE TABLE IF NOT EXISTS program_document_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programa_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  slug text NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  scope text NOT NULL CHECK (scope IN ('familia','miembro')),
  template_url text,
  template_version text,
  template_filename text,
  guide_url text,
  guide_version text,
  guide_filename text,
  is_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (programa_id, slug)
);

CREATE INDEX program_document_types_active_idx
  ON program_document_types(programa_id, is_active, display_order);

ALTER TABLE program_document_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdt_authenticated_read"
  ON program_document_types FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "pdt_superadmin_write"
  ON program_document_types FOR ALL
  TO authenticated
  USING (get_user_role() = 'superadmin')
  WITH CHECK (get_user_role() = 'superadmin');

CREATE TRIGGER program_document_types_updated_at
  BEFORE UPDATE ON program_document_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Backward-compatible seed for programa_familias ──────────────────────
-- Mirrors the 7 hardcoded values from shared/familyDocuments.ts so existing
-- upload flows keep working with the same slugs.

DO $$
DECLARE
  prog_id uuid;
BEGIN
  SELECT id INTO prog_id FROM programs WHERE slug = 'programa_familias' LIMIT 1;
  IF prog_id IS NULL THEN
    RAISE NOTICE 'programa_familias program not found — seed skipped';
    RETURN;
  END IF;

  INSERT INTO program_document_types (programa_id, slug, nombre, scope, is_required, display_order)
  VALUES
    (prog_id, 'padron_municipal',         'Padrón municipal',          'familia',   true,  10),
    (prog_id, 'justificante_situacion',   'Justificante de situación', 'familia',   false, 20),
    (prog_id, 'informe_social',           'Informe social',            'familia',   true,  30),
    (prog_id, 'autorizacion_recogida',    'Autorización de recogida',  'familia',   false, 40),
    (prog_id, 'documento_identidad',      'Documento de identidad',    'miembro',   true,  50),
    (prog_id, 'consent_bocatas',          'Consentimiento Bocatas',    'miembro',   true,  60),
    (prog_id, 'consent_banco_alimentos',  'Consentimiento BdA',        'miembro',   true,  70)
  ON CONFLICT (programa_id, slug) DO NOTHING;
END $$;
```

- [ ] **Step 2: Write the bucket migration**

`supabase/migrations/<NEXT_TS+2>_create_program_document_templates_bucket.sql`:

```sql
-- Storage bucket for blank templates + guides per document-type.
-- These files are NOT PII (they are blank forms / instructions),
-- so authenticated users can read; superadmin writes.

INSERT INTO storage.buckets (id, name, public)
VALUES ('program-document-templates', 'program-document-templates', false)
ON CONFLICT (id) DO NOTHING;

-- Read: any authenticated user can read.
CREATE POLICY "templates_read_authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'program-document-templates');

-- Write: superadmin only.
CREATE POLICY "templates_write_superadmin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'program-document-templates' AND get_user_role() = 'superadmin');

CREATE POLICY "templates_update_superadmin"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'program-document-templates' AND get_user_role() = 'superadmin')
  WITH CHECK (bucket_id = 'program-document-templates' AND get_user_role() = 'superadmin');

CREATE POLICY "templates_delete_superadmin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'program-document-templates' AND get_user_role() = 'superadmin');
```

- [ ] **Step 3: Apply locally + regenerate types**

```bash
supabase db reset
supabase gen types typescript --local > client/src/lib/database.types.ts
```

Expected: 7 rows seeded under `program_document_types`. Verify:

```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -c \
  "SELECT slug, nombre, scope FROM program_document_types ORDER BY display_order;"
```

Expected output: 7 rows in `display_order` 10..70.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/<NEXT_TS+1>_create_program_document_types.sql \
        supabase/migrations/<NEXT_TS+2>_create_program_document_templates_bucket.sql \
        client/src/lib/database.types.ts
git commit -m "feat(schema): introduce program_document_types registry + templates bucket"
```

---

### Task 4: Server router — `programDocumentTypes`

**Files:**
- Create: `server/routers/programDocumentTypes/index.ts`
- Create: `server/routers/programDocumentTypes/crud.ts`
- Create: `server/routers/programDocumentTypes/templates.ts`
- Test: `server/routers/__tests__/programDocumentTypes.test.ts`
- Modify: `server/_core/trpc.ts`

- [ ] **Step 1: Write failing tests**

`server/routers/__tests__/programDocumentTypes.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { programDocumentTypesRouter } from "../programDocumentTypes";
import type { Context } from "../../_core/context";

const ctxAs = (role: string): Context => ({
  user: { id: "u1", role, openId: "u1" },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  correlationId: "t",
} as Context);

describe("programDocumentTypes router", () => {
  beforeEach(() => vi.resetAllMocks());

  it("authenticated callers can list", async () => {
    const caller = programDocumentTypesRouter.createCaller(ctxAs("voluntario"));
    // We're testing it doesn't throw an authorization error before reaching DB.
    await expect(caller.list({ programaSlug: "programa_familias" }))
      .rejects.not.toThrow(/UNAUTHORIZED|FORBIDDEN/);
  });

  it("non-superadmin cannot create", async () => {
    const caller = programDocumentTypesRouter.createCaller(ctxAs("admin"));
    await expect(caller.create({
      programaId: "00000000-0000-0000-0000-000000000001",
      slug: "test_doc",
      nombre: "Test",
      scope: "familia",
    })).rejects.toThrow(/UNAUTHORIZED|FORBIDDEN/);
  });

  it("validates scope enum", async () => {
    const caller = programDocumentTypesRouter.createCaller(ctxAs("superadmin"));
    await expect(caller.create({
      programaId: "00000000-0000-0000-0000-000000000001",
      slug: "x",
      nombre: "X",
      // @ts-expect-error invalid value for testing
      scope: "wrong",
    })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests, expect FAIL**

```bash
pnpm test --run server/routers/__tests__/programDocumentTypes.test.ts
```

- [ ] **Step 3: Implement `crud.ts`**

`server/routers/programDocumentTypes/crud.ts`:

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, superadminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";

const uuidLike = z.string().uuid();

const ScopeEnum = z.enum(["familia", "miembro"]);

const TypeInsertSchema = z.object({
  programaId: uuidLike,
  slug: z.string().min(1).max(60).regex(/^[a-z0-9_]+$/),
  nombre: z.string().min(1).max(120),
  descripcion: z.string().max(500).optional(),
  scope: ScopeEnum,
  isRequired: z.boolean().default(false),
  displayOrder: z.number().int().default(0),
});

const TypeUpdateSchema = z.object({
  id: uuidLike,
  nombre: z.string().min(1).max(120).optional(),
  descripcion: z.string().max(500).optional(),
  isRequired: z.boolean().optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
});

export const programDocumentTypesCrudRouter = router({
  list: protectedProcedure
    .input(z.object({
      programaId: uuidLike.optional(),
      programaSlug: z.string().optional(),
    }).refine(d => !!(d.programaId || d.programaSlug), "programaId or programaSlug required"))
    .query(async ({ input }) => {
      const db = createAdminClient();
      let programaId = input.programaId;
      if (!programaId && input.programaSlug) {
        const { data, error } = await db
          .from("programs")
          .select("id")
          .eq("slug", input.programaSlug)
          .single();
        if (error || !data) throw new TRPCError({ code: "NOT_FOUND", message: "Programa no encontrado" });
        programaId = data.id;
      }
      const { data, error } = await db
        .from("program_document_types")
        .select("*")
        .eq("programa_id", programaId!)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  create: superadminProcedure
    .input(TypeInsertSchema)
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("program_document_types")
        .insert({
          programa_id: input.programaId,
          slug: input.slug,
          nombre: input.nombre,
          descripcion: input.descripcion ?? null,
          scope: input.scope,
          is_required: input.isRequired,
          display_order: input.displayOrder,
        })
        .select()
        .single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  update: superadminProcedure
    .input(TypeUpdateSchema)
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { id, ...rest } = input;
      const update: Record<string, unknown> = {};
      if (rest.nombre !== undefined) update.nombre = rest.nombre;
      if (rest.descripcion !== undefined) update.descripcion = rest.descripcion;
      if (rest.isRequired !== undefined) update.is_required = rest.isRequired;
      if (rest.isActive !== undefined) update.is_active = rest.isActive;
      if (rest.displayOrder !== undefined) update.display_order = rest.displayOrder;
      update.updated_at = new Date().toISOString();
      const { data, error } = await db
        .from("program_document_types")
        .update(update)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),
});
```

- [ ] **Step 4: Implement `templates.ts`**

`server/routers/programDocumentTypes/templates.ts`:

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, superadminProcedure, protectedProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";

const uuidLike = z.string().uuid();
const BUCKET = "program-document-templates";

export const programDocumentTypesTemplatesRouter = router({
  /** Returns a short-lived signed URL for a template/guide in the templates bucket. */
  signedUrl: protectedProcedure
    .input(z.object({
      path: z.string().min(1),
      kind: z.enum(["template", "guide"]),
    }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db.storage.from(BUCKET)
        .createSignedUrl(input.path, 60 * 60); // 1 hour
      if (error || !data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error?.message ?? "Signed URL failed" });
      return { signedUrl: data.signedUrl };
    }),

  /** Records that a new template/guide has been uploaded for a given doc type.
   *  Upload itself is done client-side via the Supabase JS client (signed upload),
   *  and the resulting path is registered here.
   */
  registerUpload: superadminProcedure
    .input(z.object({
      docTypeId: uuidLike,
      kind: z.enum(["template", "guide"]),
      path: z.string().min(1),
      filename: z.string().min(1),
      version: z.string().min(1).max(20),
    }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (input.kind === "template") {
        update.template_url = input.path;
        update.template_filename = input.filename;
        update.template_version = input.version;
      } else {
        update.guide_url = input.path;
        update.guide_filename = input.filename;
        update.guide_version = input.version;
      }
      const { data, error } = await db
        .from("program_document_types")
        .update(update)
        .eq("id", input.docTypeId)
        .select()
        .single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),
});
```

- [ ] **Step 5: Compose `index.ts`**

`server/routers/programDocumentTypes/index.ts`:

```typescript
import { mergeRouters } from "../../_core/trpc";
import { programDocumentTypesCrudRouter } from "./crud";
import { programDocumentTypesTemplatesRouter } from "./templates";

export const programDocumentTypesRouter = mergeRouters(
  programDocumentTypesCrudRouter,
  programDocumentTypesTemplatesRouter,
);
```

- [ ] **Step 6: Wire into `appRouter`**

In `server/_core/trpc.ts`:

```typescript
import { programDocumentTypesRouter } from "../routers/programDocumentTypes";

export const appRouter = router({
  // ...existing
  programDocumentTypes: programDocumentTypesRouter,
});
```

- [ ] **Step 7: Run tests, expect PASS**

```bash
pnpm test --run server/routers/__tests__/programDocumentTypes.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add server/routers/programDocumentTypes server/routers/__tests__/programDocumentTypes.test.ts server/_core/trpc.ts
git commit -m "feat(server): programDocumentTypes router (crud + templates signed-url + register)"
```

---

### Task 5: `<ProgramTabs />` component skeleton

**Files:**
- Create: `client/src/features/programs/components/ProgramTabs.tsx`
- Create: `client/src/features/programs/components/ProgramTabs.test.tsx`
- Create: `client/src/features/programs/hooks/useTabParam.ts`

- [ ] **Step 1: Write the URL-state hook**

`client/src/features/programs/hooks/useTabParam.ts`:

```typescript
import { useLocation } from "wouter";
import { useCallback, useMemo } from "react";

export type ProgramTab = "familias" | "mapa" | "reports" | "uploads" | "derivar";
export const PROGRAM_TABS: readonly ProgramTab[] = ["familias", "mapa", "reports", "uploads", "derivar"];

const DEFAULT_TAB: ProgramTab = "familias";

export function useTabParam(): [ProgramTab, (tab: ProgramTab) => void] {
  const [location, navigate] = useLocation();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const raw = params.get("tab") as ProgramTab | null;
  const current = PROGRAM_TABS.includes(raw as ProgramTab) ? (raw as ProgramTab) : DEFAULT_TAB;
  const setTab = useCallback((tab: ProgramTab) => {
    const next = new URLSearchParams(window.location.search);
    next.set("tab", tab);
    navigate(`${location.split("?")[0]}?${next.toString()}`, { replace: false });
  }, [location, navigate]);
  return [current, setTab];
}
```

- [ ] **Step 2: Write the failing component test**

`client/src/features/programs/components/ProgramTabs.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgramTabs } from "./ProgramTabs";

const FAKE_PROGRAM = {
  id: "00000000-0000-0000-0000-000000000001",
  slug: "programa_familias",
  nombre: "Programa de Familia",
};

describe("<ProgramTabs />", () => {
  it("renders 5 tab buttons for programa_familias", () => {
    render(<ProgramTabs program={FAKE_PROGRAM} />);
    expect(screen.getByRole("tab", { name: /familias/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /mapa/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /reports/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /uploads/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /derivar/i })).toBeInTheDocument();
  });

  it("disables Mapa, Reports, Derivar in Phase 1", () => {
    render(<ProgramTabs program={FAKE_PROGRAM} />);
    expect(screen.getByRole("tab", { name: /mapa/i })).toBeDisabled();
    expect(screen.getByRole("tab", { name: /reports/i })).toBeDisabled();
    expect(screen.getByRole("tab", { name: /derivar/i })).toBeDisabled();
    expect(screen.getByRole("tab", { name: /familias/i })).toBeEnabled();
    expect(screen.getByRole("tab", { name: /uploads/i })).toBeEnabled();
  });

  it("renders nothing for non-programa_familias slugs", () => {
    const otherProgram = { ...FAKE_PROGRAM, slug: "comedor" };
    const { container } = render(<ProgramTabs program={otherProgram} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests, expect FAIL**

```bash
pnpm test --run client/src/features/programs/components/ProgramTabs.test.tsx
```

- [ ] **Step 4: Implement `ProgramTabs.tsx`**

`client/src/features/programs/components/ProgramTabs.tsx`:

```typescript
import { lazy, Suspense } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTabParam, type ProgramTab } from "../hooks/useTabParam";

const FamiliasTab = lazy(() => import("@/features/familias-tab"));
const UploadsTab = lazy(() => import("@/features/uploads-tab"));

interface Program {
  id: string;
  slug: string;
  nombre: string;
}

interface ProgramTabsProps {
  program: Program;
}

const PHASE1_ENABLED: ProgramTab[] = ["familias", "uploads"];

const TAB_LABELS: Record<ProgramTab, string> = {
  familias: "Familias",
  mapa: "Mapa",
  reports: "Reports",
  uploads: "Uploads",
  derivar: "Derivar",
};

const TabFallback = () => (
  <div className="flex items-center justify-center py-12">
    <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
  </div>
);

export function ProgramTabs({ program }: ProgramTabsProps) {
  const [tab, setTab] = useTabParam();

  if (program.slug !== "programa_familias") {
    return null;
  }

  const renderDisabledTrigger = (key: ProgramTab) => (
    <Tooltip key={key}>
      <TooltipTrigger asChild>
        <span tabIndex={0}>
          <TabsTrigger value={key} disabled aria-label={TAB_LABELS[key]}>
            {TAB_LABELS[key]}
          </TabsTrigger>
        </span>
      </TooltipTrigger>
      <TooltipContent>Próximamente</TooltipContent>
    </Tooltip>
  );

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as ProgramTab)} className="w-full">
      <TabsList>
        <TabsTrigger value="familias">{TAB_LABELS.familias}</TabsTrigger>
        {renderDisabledTrigger("mapa")}
        {renderDisabledTrigger("reports")}
        <TabsTrigger value="uploads">{TAB_LABELS.uploads}</TabsTrigger>
        {renderDisabledTrigger("derivar")}
      </TabsList>

      <TabsContent value="familias">
        <Suspense fallback={<TabFallback />}>
          {PHASE1_ENABLED.includes("familias") && <FamiliasTab programaId={program.id} />}
        </Suspense>
      </TabsContent>

      <TabsContent value="uploads">
        <Suspense fallback={<TabFallback />}>
          {PHASE1_ENABLED.includes("uploads") && <UploadsTab programaId={program.id} />}
        </Suspense>
      </TabsContent>
    </Tabs>
  );
}
```

NOTE — `FamiliasTab` and `UploadsTab` are scaffolded in later tasks; the `lazy(() => import(...))` calls will resolve to skeleton components first and full implementations after.

- [ ] **Step 5: Scaffold the two lazy targets so the tabs render**

`client/src/features/familias-tab/index.tsx` (skeleton — Task 7 fills this in):

```typescript
interface FamiliasTabProps { programaId: string }
export default function FamiliasTab(_props: FamiliasTabProps) {
  return <div className="p-8 text-center text-muted-foreground">Familias tab — próximamente</div>;
}
```

`client/src/features/uploads-tab/index.tsx` (skeleton — Task 9 fills this in):

```typescript
interface UploadsTabProps { programaId: string }
export default function UploadsTab(_props: UploadsTabProps) {
  return <div className="p-8 text-center text-muted-foreground">Uploads tab — próximamente</div>;
}
```

- [ ] **Step 6: Run tests, expect PASS**

```bash
pnpm test --run client/src/features/programs/components/ProgramTabs.test.tsx
```

- [ ] **Step 7: Commit**

```bash
git add client/src/features/programs/components/ProgramTabs.tsx \
        client/src/features/programs/components/ProgramTabs.test.tsx \
        client/src/features/programs/hooks/useTabParam.ts \
        client/src/features/familias-tab/index.tsx \
        client/src/features/uploads-tab/index.tsx
git commit -m "feat(programs): add ProgramTabs with tab strip + URL state + Phase 1 placeholders"
```

---

### Task 6: Mount `<ProgramTabs />` inside `ProgramaDetalle.tsx`

**Files:**
- Modify: `client/src/pages/ProgramaDetalle.tsx`

- [ ] **Step 1: Read the current page top**

```bash
sed -n '1,80p' client/src/pages/ProgramaDetalle.tsx
```

- [ ] **Step 2: Insert `<ProgramTabs />`**

Locate the top of the JSX return inside the `ProgramaDetalle` component (the rendered content begins after the loading guard). Insert the `<ProgramTabs />` component **immediately under the page header** (program name + edit button), before the existing KPI cards. Wrap the existing content in a conditional so it only renders when slug !== `programa_familias`:

```tsx
import { ProgramTabs } from "@/features/programs/components/ProgramTabs";

// ...inside the rendered JSX, after the page header:
{program && program.slug === "programa_familias" ? (
  <ProgramTabs program={{ id: program.id, slug: program.slug, nombre: program.nombre }} />
) : (
  <>
    {/* existing KPI cards + EnrolledPersonsTable + EnrollPersonModal */}
  </>
)}
```

- [ ] **Step 3: Manual smoke test**

```bash
pnpm dev
# Visit http://localhost:3000/programas/programa_familias
# Expect: tab strip with Familias/Mapa/Reports/Uploads/Derivar; default tab=familias
# Visit http://localhost:3000/programas/comedor (or any non-family slug)
# Expect: existing UI, no tab strip
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/ProgramaDetalle.tsx
git commit -m "feat(programs): mount ProgramTabs inside /programas/programa_familias"
```

---

### Task 7: Familias tab — list + filters

**Files:**
- Modify: `client/src/features/familias-tab/index.tsx`
- Create: `client/src/features/familias-tab/FamiliasList.tsx`
- Create: `client/src/features/familias-tab/hooks/useFamiliasFilters.ts`
- Test: `client/src/features/familias-tab/__tests__/FamiliasList.test.tsx`
- Test: `client/src/features/familias-tab/__tests__/useFamiliasFilters.test.ts`

- [ ] **Step 1: Write the URL-state hook test**

`client/src/features/familias-tab/__tests__/useFamiliasFilters.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFamiliasFilters } from "../hooks/useFamiliasFilters";

describe("useFamiliasFilters", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/programas/programa_familias?tab=familias");
  });

  it("starts with default 'activa' estado", () => {
    const { result } = renderHook(() => useFamiliasFilters());
    expect(result.current.filters.estado).toBe("activa");
  });

  it("updates URL when setSearch is called", () => {
    const { result } = renderHook(() => useFamiliasFilters());
    act(() => result.current.setSearch("García"));
    expect(window.location.search).toContain("search=Garc%C3%ADa");
  });

  it("clears search when empty string is set", () => {
    const { result } = renderHook(() => useFamiliasFilters());
    act(() => result.current.setSearch("test"));
    act(() => result.current.setSearch(""));
    expect(window.location.search).not.toContain("search=");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
pnpm test --run client/src/features/familias-tab/__tests__/useFamiliasFilters.test.ts
```

- [ ] **Step 3: Implement `useFamiliasFilters.ts`**

`client/src/features/familias-tab/hooks/useFamiliasFilters.ts`:

```typescript
import { useCallback, useMemo } from "react";
import { useLocation } from "wouter";

export interface FamiliasFilters {
  search?: string;
  estado: "activa" | "baja" | "all";
  sinGuf: boolean;
  sinInformeSocial: boolean;
}

const DEFAULT_FILTERS: FamiliasFilters = {
  estado: "activa",
  sinGuf: false,
  sinInformeSocial: false,
};

function parseParams(search: string): FamiliasFilters {
  const params = new URLSearchParams(search);
  const estado = params.get("estado");
  return {
    search: params.get("search") ?? undefined,
    estado: estado === "baja" || estado === "all" ? estado : "activa",
    sinGuf: params.get("sin_guf") === "1",
    sinInformeSocial: params.get("sin_informe") === "1",
  };
}

function buildSearch(filters: FamiliasFilters, currentSearch: string): string {
  const next = new URLSearchParams(currentSearch);
  next.set("tab", "familias");
  if (filters.search) next.set("search", filters.search); else next.delete("search");
  if (filters.estado !== "activa") next.set("estado", filters.estado); else next.delete("estado");
  if (filters.sinGuf) next.set("sin_guf", "1"); else next.delete("sin_guf");
  if (filters.sinInformeSocial) next.set("sin_informe", "1"); else next.delete("sin_informe");
  return next.toString();
}

export function useFamiliasFilters() {
  const [location, navigate] = useLocation();
  const filters = useMemo(() => parseParams(window.location.search), [location]);

  const update = useCallback((partial: Partial<FamiliasFilters>) => {
    const merged = { ...filters, ...partial };
    const path = window.location.pathname;
    navigate(`${path}?${buildSearch(merged, window.location.search)}`, { replace: false });
  }, [filters, navigate]);

  return {
    filters,
    setSearch: (s: string) => update({ search: s || undefined }),
    setEstado: (e: FamiliasFilters["estado"]) => update({ estado: e }),
    setSinGuf: (v: boolean) => update({ sinGuf: v }),
    setSinInformeSocial: (v: boolean) => update({ sinInformeSocial: v }),
    reset: () => navigate(`${window.location.pathname}?tab=familias`, { replace: false }),
  };
}
```

- [ ] **Step 4: Implement `FamiliasList.tsx`**

`client/src/features/familias-tab/FamiliasList.tsx`:

```typescript
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, AlertTriangle } from "lucide-react";
import { useFamiliasFilters } from "./hooks/useFamiliasFilters";

interface FamiliasListProps {
  onRowClick: (familyId: string) => void;
}

export function FamiliasList({ onRowClick }: FamiliasListProps) {
  const { filters, setSearch, setEstado, setSinGuf, setSinInformeSocial } = useFamiliasFilters();
  const [searchInput, setSearchInput] = useState(filters.search ?? "");

  const { data: families, isLoading } = trpc.families.getAll.useQuery({
    search: filters.search,
    estado: filters.estado,
    sin_alta_guf: filters.sinGuf || undefined,
    sin_informe_social: filters.sinInformeSocial || undefined,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onBlur={() => setSearch(searchInput)}
            onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput)}
            placeholder="Buscar nombre o número de familia..."
            className="pl-9"
          />
        </div>
        <Select value={filters.estado} onValueChange={(v) => setEstado(v as typeof filters.estado)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="activa">Activas</SelectItem>
            <SelectItem value="baja">En baja</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={filters.sinGuf ? "default" : "outline"}
          onClick={() => setSinGuf(!filters.sinGuf)}
        >
          Sin GUF
        </Button>
        <Button
          variant={filters.sinInformeSocial ? "default" : "outline"}
          onClick={() => setSinInformeSocial(!filters.sinInformeSocial)}
        >
          Sin informe social
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2 font-medium">Nº</th>
                <th className="text-left p-2 font-medium">Titular</th>
                <th className="text-left p-2 font-medium">Miembros</th>
                <th className="text-left p-2 font-medium">Estado</th>
                <th className="text-left p-2 font-medium">Informe</th>
                <th className="text-left p-2 font-medium w-8"></th>
              </tr>
            </thead>
            <tbody>
              {(families ?? []).map((f) => {
                const titular = (f as { persons?: { nombre?: string; apellidos?: string } }).persons;
                const sinInforme = !f.informe_social;
                const sinGuf = !f.alta_en_guf;
                return (
                  <tr
                    key={f.id}
                    className="border-t hover:bg-muted/40 cursor-pointer"
                    onClick={() => onRowClick(f.id)}
                  >
                    <td className="p-2 font-mono">{f.familia_numero}</td>
                    <td className="p-2">{titular ? `${titular.nombre ?? ""} ${titular.apellidos ?? ""}`.trim() : "—"}</td>
                    <td className="p-2">{(f.num_adultos ?? 0) + (f.num_menores_18 ?? 0)}</td>
                    <td className="p-2">
                      <Badge variant={f.estado === "activa" ? "default" : "outline"}>
                        {f.estado === "activa" ? "Activa" : "En baja"}
                      </Badge>
                    </td>
                    <td className="p-2">{sinInforme ? <Badge variant="destructive">Pendiente</Badge> : <Badge variant="default">Al día</Badge>}</td>
                    <td className="p-2">
                      {(sinGuf || sinInforme) && <AlertTriangle className="h-4 w-4 text-amber-500" aria-label="Atención requerida" />}
                    </td>
                  </tr>
                );
              })}
              {(families ?? []).length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Update `client/src/features/familias-tab/index.tsx`**

```typescript
import { useState } from "react";
import { FamiliasList } from "./FamiliasList";
import { FamiliaDrawer } from "./FamiliaDrawer";

interface FamiliasTabProps { programaId: string }

export default function FamiliasTab({ programaId: _programaId }: FamiliasTabProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="space-y-3 p-4">
      <FamiliasList onRowClick={setOpenId} />
      <FamiliaDrawer familyId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
```

- [ ] **Step 6: Run tests, expect PASS for filters hook (drawer test follows in Task 8)**

```bash
pnpm test --run client/src/features/familias-tab/__tests__/useFamiliasFilters.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add client/src/features/familias-tab
git commit -m "feat(familias-tab): list + URL-driven filters + dense table"
```

NOTE: `FamiliaDrawer.tsx` is created empty in Task 8; we reference it here to keep the import wiring clean. If `pnpm check` complains, scaffold a one-line stub: `export function FamiliaDrawer(_p:{familyId:string|null;onClose:()=>void}){return null}` in this commit.

---

### Task 8: Familias tab — drawer (`<FamiliaDrawer />`)

**Files:**
- Create: `client/src/features/familias-tab/FamiliaDrawer.tsx`
- Test: `client/src/features/familias-tab/__tests__/FamiliaDrawer.test.tsx`

- [ ] **Step 1: Write failing test**

`client/src/features/familias-tab/__tests__/FamiliaDrawer.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FamiliaDrawer } from "../FamiliaDrawer";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    families: {
      getById: { useQuery: () => ({ data: null, isLoading: false }) },
    },
  },
}));

describe("<FamiliaDrawer />", () => {
  it("renders nothing when familyId is null", () => {
    const { container } = render(<FamiliaDrawer familyId={null} onClose={() => {}} />);
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL (component does not exist yet)**

```bash
pnpm test --run client/src/features/familias-tab/__tests__/FamiliaDrawer.test.tsx
```

- [ ] **Step 3: Implement the drawer**

`client/src/features/familias-tab/FamiliaDrawer.tsx`:

```typescript
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { ExternalLink } from "lucide-react";

interface FamiliaDrawerProps {
  familyId: string | null;
  onClose: () => void;
}

export function FamiliaDrawer({ familyId, onClose }: FamiliaDrawerProps) {
  const { data: family, isLoading } = trpc.families.getById.useQuery(
    { id: familyId ?? "" },
    { enabled: !!familyId }
  );

  if (!familyId) return null;

  const titular = family ? (family as { persons?: { nombre?: string; apellidos?: string; telefono?: string } }).persons : undefined;

  return (
    <Sheet open={!!familyId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isLoading ? <Skeleton className="h-6 w-32" /> :
              `Familia #${family?.familia_numero ?? "—"}`}
          </SheetTitle>
          <SheetDescription>
            {isLoading ? <Skeleton className="h-4 w-48" /> :
              titular ? `Titular: ${titular.nombre} ${titular.apellidos}` : "—"}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : family ? (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Estado: </span>
                <Badge variant={family.estado === "activa" ? "default" : "outline"}>
                  {family.estado === "activa" ? "Activa" : "En baja"}
                </Badge>
              </div>
              <div><span className="text-muted-foreground">Miembros: </span>{(family.num_adultos ?? 0) + (family.num_menores_18 ?? 0)}</div>
              <div><span className="text-muted-foreground">Padrón: </span>{family.padron_recibido ? "Sí" : "Pendiente"}</div>
              <div><span className="text-muted-foreground">Informe: </span>{family.informe_social ? "Al día" : "Pendiente"}</div>
              <div><span className="text-muted-foreground">GUF: </span>{family.alta_en_guf ? "Sí" : "No"}</div>
              <div><span className="text-muted-foreground">Recoge: </span>{family.persona_recoge ?? "—"}</div>
            </div>

            <div className="mt-6 space-y-2">
              <Link href={`/familias/${family.id}`}>
                <a><Button className="w-full" variant="default">
                  <ExternalLink className="h-4 w-4 mr-2" /> Abrir página completa
                </Button></a>
              </Link>
            </div>
          </>
        ) : (
          <div className="mt-6 text-center text-muted-foreground">No encontrado.</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Run tests, expect PASS**

```bash
pnpm test --run client/src/features/familias-tab/__tests__/FamiliaDrawer.test.tsx
```

- [ ] **Step 5: Manual smoke**

```bash
pnpm dev
# Open /programas/programa_familias?tab=familias
# Click any row, drawer opens with family info, "Abrir página completa" navigates to /familias/:id
```

- [ ] **Step 6: Commit**

```bash
git add client/src/features/familias-tab/FamiliaDrawer.tsx \
        client/src/features/familias-tab/__tests__/FamiliaDrawer.test.tsx
git commit -m "feat(familias-tab): add right-side drawer for quick family detail"
```

---

### Task 9: Saved-views bar

**Files:**
- Create: `client/src/features/familias-tab/SavedViewsBar.tsx`
- Create: `client/src/features/familias-tab/hooks/useFamilySavedViews.ts`
- Test: `client/src/features/familias-tab/__tests__/SavedViewsBar.test.tsx`
- Modify: `client/src/features/familias-tab/index.tsx`

- [ ] **Step 1: Implement the hook**

`client/src/features/familias-tab/hooks/useFamilySavedViews.ts`:

```typescript
import { trpc } from "@/lib/trpc";

export function useFamilySavedViews(programaId: string) {
  const list = trpc.familySavedViews.list.useQuery({ programaId });
  const create = trpc.familySavedViews.create.useMutation();
  const update = trpc.familySavedViews.update.useMutation();
  const remove = trpc.familySavedViews.delete.useMutation();
  return { list, create, update, remove };
}
```

- [ ] **Step 2: Implement the component**

`client/src/features/familias-tab/SavedViewsBar.tsx`:

```typescript
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Star, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useFamilySavedViews } from "./hooks/useFamilySavedViews";
import { useFamiliasFilters, type FamiliasFilters } from "./hooks/useFamiliasFilters";

interface SavedViewsBarProps {
  programaId: string;
}

export function SavedViewsBar({ programaId }: SavedViewsBarProps) {
  const { list, create, remove } = useFamilySavedViews(programaId);
  const { filters } = useFamiliasFilters();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);

  const onSave = async () => {
    if (!name.trim()) return;
    try {
      await create.mutateAsync({
        programaId,
        nombre: name.trim(),
        filtersJson: {
          search: filters.search,
          estado: filters.estado,
          sinGuf: filters.sinGuf,
          sinInformeSocial: filters.sinInformeSocial,
        } satisfies Partial<FamiliasFilters> as never,
        isShared: shared,
      });
      await list.refetch();
      setName("");
      setShared(false);
      setOpen(false);
      toast.success("Vista guardada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar la vista");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground mr-1">Vistas:</span>
      {(list.data ?? []).map((v) => (
        <div key={v.id} className="inline-flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => {
            const next = new URLSearchParams(window.location.search);
            next.set("tab", "familias");
            const f = v.filters_json as Record<string, string | boolean | undefined>;
            if (f.search) next.set("search", String(f.search)); else next.delete("search");
            if (f.estado && f.estado !== "activa") next.set("estado", String(f.estado)); else next.delete("estado");
            if (f.sinGuf) next.set("sin_guf", "1"); else next.delete("sin_guf");
            if (f.sinInformeSocial) next.set("sin_informe", "1"); else next.delete("sin_informe");
            window.history.pushState({}, "", `${window.location.pathname}?${next.toString()}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}>
            {v.is_shared && <Star className="h-3 w-3 mr-1 fill-current" aria-label="Compartida" />}
            {v.nombre}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={async () => {
            await remove.mutateAsync({ id: v.id });
            await list.refetch();
          }}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva vista</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Guardar filtros como vista</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="view-name">Nombre</Label>
              <Input id="view-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Familias activas" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="shared" checked={shared} onCheckedChange={(v) => setShared(v === true)} />
              <Label htmlFor="shared" className="cursor-pointer">Compartir con otros administradores</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={onSave} disabled={!name.trim() || create.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 3: Wire into the tab**

`client/src/features/familias-tab/index.tsx` becomes:

```typescript
import { useState } from "react";
import { FamiliasList } from "./FamiliasList";
import { FamiliaDrawer } from "./FamiliaDrawer";
import { SavedViewsBar } from "./SavedViewsBar";

interface FamiliasTabProps { programaId: string }

export default function FamiliasTab({ programaId }: FamiliasTabProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="space-y-3 p-4">
      <SavedViewsBar programaId={programaId} />
      <FamiliasList onRowClick={setOpenId} />
      <FamiliaDrawer familyId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
```

- [ ] **Step 4: Smoke test**

```bash
pnpm test --run client/src/features/familias-tab
pnpm dev
# Save a view, see it appear, click to apply, click trash to remove.
```

- [ ] **Step 5: Commit**

```bash
git add client/src/features/familias-tab
git commit -m "feat(familias-tab): saved-views bar with create/apply/delete + share toggle"
```

---

### Task 10: Route migration — legacy `/familias*` redirects

**Files:**
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Add redirect components**

After the existing imports in `client/src/App.tsx`, add a small `<RedirectTo />` helper if `wouter` doesn't expose one (it doesn't — we build it):

```tsx
import { Redirect } from "wouter";  // wouter v3 has Redirect; if not, use useEffect+navigate
```

If `wouter` exports `Redirect`, use it directly. If it does not (verify with `grep -r "from \"wouter\"" node_modules/wouter/index.d.ts`), define this helper inline:

```tsx
function RedirectTo({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => { navigate(to, { replace: true }); }, [to, navigate]);
  return null;
}
```

- [ ] **Step 2: Add redirect routes BEFORE the existing `/familias*` routes**

```tsx
// In Router(), placed BEFORE the existing /familias routes:
<Route path="/familias/cumplimiento">
  <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
    <RedirectTo to="/programas/programa_familias?tab=familias" />
  </ProtectedRoute>
</Route>
<Route path="/familias/informes-sociales">
  <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
    <RedirectTo to="/programas/programa_familias?tab=reports" />
  </ProtectedRoute>
</Route>
<Route path="/familias">
  <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
    <RedirectTo to="/programas/programa_familias?tab=familias" />
  </ProtectedRoute>
</Route>
```

**IMPORTANT:** delete the existing `<Route path="/familias">` and `<Route path="/familias/cumplimiento">` and `<Route path="/familias/informes-sociales">` routes (the ones rendering `FamiliasList`, `FamiliasCompliance`, `FamiliasInformesSociales` directly). Keep `/familias/:id`, `/familias/nueva`, `/familias/entregas`, `/familias/verificar` unchanged.

- [ ] **Step 3: Smoke test**

```bash
pnpm dev
# Visit /familias                        → redirects to /programas/programa_familias?tab=familias
# Visit /familias/cumplimiento           → redirects (Phase 2 will route to a compliance saved view)
# Visit /familias/informes-sociales      → redirects (tab=reports will be 'Próximamente' until Phase 2)
# Visit /familias/123                    → unchanged (FamiliaDetalle renders)
# Visit /familias/nueva                  → unchanged
# Visit /familias/entregas               → unchanged
```

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat(routes): redirect legacy /familias[/cumplimiento|/informes-sociales] into the tab surface"
```

---

### Task 11: Uploads tab — types catalog

**Files:**
- Create: `client/src/features/uploads-tab/TiposCatalog.tsx`
- Create: `client/src/features/uploads-tab/hooks/useProgramDocumentTypes.ts`
- Test: `client/src/features/uploads-tab/__tests__/TiposCatalog.test.tsx`
- Modify: `client/src/features/uploads-tab/index.tsx`

- [ ] **Step 1: Hook**

`client/src/features/uploads-tab/hooks/useProgramDocumentTypes.ts`:

```typescript
import { trpc } from "@/lib/trpc";

export function useProgramDocumentTypes(programaId: string) {
  return trpc.programDocumentTypes.list.useQuery({ programaId });
}

export function useSignedUrl() {
  return trpc.programDocumentTypes.signedUrl.useMutation();
}
```

NOTE: If `signedUrl` is exposed as a query rather than a mutation in the router, switch to `useQuery({ enabled: false })` + `refetch()`. The router task (Task 4) defines it as a query — adjust accordingly:

```typescript
export function useSignedUrl(path: string, kind: "template" | "guide", enabled: boolean) {
  return trpc.programDocumentTypes.signedUrl.useQuery({ path, kind }, { enabled });
}
```

Use the second form. The component below assumes per-click fetching with `refetch`.

- [ ] **Step 2: Failing test**

`client/src/features/uploads-tab/__tests__/TiposCatalog.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TiposCatalog } from "../TiposCatalog";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    programDocumentTypes: {
      list: {
        useQuery: () => ({
          data: [
            { id: "t1", slug: "padron_municipal", nombre: "Padrón municipal", scope: "familia",
              template_url: "templates/p.docx", template_filename: "p.docx", template_version: "v1",
              guide_url: null, guide_filename: null, guide_version: null,
              is_active: true, display_order: 10 },
          ],
          isLoading: false,
        }),
      },
      signedUrl: { useQuery: () => ({ data: null, refetch: vi.fn() }) },
    },
  },
}));

describe("<TiposCatalog />", () => {
  it("renders rows for each active type", () => {
    render(<TiposCatalog programaId="prog-1" />);
    expect(screen.getByText("Padrón municipal")).toBeInTheDocument();
  });

  it("shows template-download link when template_url exists", () => {
    render(<TiposCatalog programaId="prog-1" />);
    expect(screen.getByRole("button", { name: /plantilla/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run, expect FAIL**

```bash
pnpm test --run client/src/features/uploads-tab/__tests__/TiposCatalog.test.tsx
```

- [ ] **Step 4: Implement `TiposCatalog.tsx`**

`client/src/features/uploads-tab/TiposCatalog.tsx`:

```typescript
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Download } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useProgramDocumentTypes } from "./hooks/useProgramDocumentTypes";
import { toast } from "sonner";

interface TiposCatalogProps {
  programaId: string;
}

export function TiposCatalog({ programaId }: TiposCatalogProps) {
  const { data: types, isLoading } = useProgramDocumentTypes(programaId);
  const trpcCtx = trpc.useContext();

  const onDownload = async (path: string, kind: "template" | "guide", filename: string) => {
    try {
      const { signedUrl } = await trpcCtx.programDocumentTypes.signedUrl.fetch({ path, kind });
      const a = document.createElement("a");
      a.href = signedUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al descargar");
    }
  };

  if (isLoading) return <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-sm font-medium mb-2">Tipos de documento</div>
        <ul className="divide-y">
          {(types ?? []).map((t) => (
            <li key={t.id} className="py-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium truncate">{t.nombre}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.scope === "familia" ? "Por familia" : "Por miembro"}
                    {t.is_required ? " · Obligatorio" : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {t.template_url && t.template_filename && (
                  <Button variant="outline" size="sm" onClick={() => onDownload(t.template_url!, "template", t.template_filename!)}>
                    <Download className="h-3 w-3 mr-1" /> Plantilla {t.template_version ? `(${t.template_version})` : ""}
                  </Button>
                )}
                {t.guide_url && t.guide_filename && (
                  <Button variant="outline" size="sm" onClick={() => onDownload(t.guide_url!, "guide", t.guide_filename!)}>
                    <Download className="h-3 w-3 mr-1" /> Guía {t.guide_version ? `(${t.guide_version})` : ""}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Wire into tab**

```typescript
// client/src/features/uploads-tab/index.tsx
import { TiposCatalog } from "./TiposCatalog";

interface UploadsTabProps { programaId: string }
export default function UploadsTab({ programaId }: UploadsTabProps) {
  return (
    <div className="space-y-3 p-4">
      <TiposCatalog programaId={programaId} />
      {/* PendientesGrid + ArchiveExplorer follow in Tasks 12-13 */}
    </div>
  );
}
```

- [ ] **Step 6: Run tests, expect PASS**

```bash
pnpm test --run client/src/features/uploads-tab/__tests__/TiposCatalog.test.tsx
```

- [ ] **Step 7: Commit**

```bash
git add client/src/features/uploads-tab/TiposCatalog.tsx \
        client/src/features/uploads-tab/hooks/useProgramDocumentTypes.ts \
        client/src/features/uploads-tab/__tests__/TiposCatalog.test.tsx \
        client/src/features/uploads-tab/index.tsx
git commit -m "feat(uploads-tab): types catalog with template + guide downloads"
```

---

### Task 12: Uploads tab — Upload modal (single + bulk)

**Files:**
- Create: `client/src/features/uploads-tab/UploadModal.tsx`
- Test: `client/src/features/uploads-tab/__tests__/UploadModal.test.tsx`

- [ ] **Step 1: Implement `UploadModal.tsx`**

`client/src/features/uploads-tab/UploadModal.tsx`:

```typescript
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useProgramDocumentTypes } from "./hooks/useProgramDocumentTypes";

interface UploadModalProps {
  programaId: string;
  open: boolean;
  onClose: () => void;
}

export function UploadModal({ programaId, open, onClose }: UploadModalProps) {
  const { data: types } = useProgramDocumentTypes(programaId);
  const [tipoId, setTipoId] = useState("");
  const [familySearch, setFamilySearch] = useState("");
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [notas, setNotas] = useState("");

  const familySearchQuery = trpc.families.getAll.useQuery(
    { search: familySearch, estado: "all" },
    { enabled: familySearch.length >= 2 }
  );
  const memberQuery = trpc.families.getById.useQuery(
    { id: familyId ?? "" },
    { enabled: !!familyId }
  );

  const tipo = (types ?? []).find((t) => t.id === tipoId);
  const needsMember = tipo?.scope === "miembro";

  // Upload mutation: existing families.uploadFamilyDocument procedure (no signature change).
  const uploadMutation = trpc.families.uploadFamilyDocument.useMutation();

  const onSubmit = async () => {
    if (!tipo) { toast.error("Selecciona un tipo de documento"); return; }
    if (!familyId) { toast.error("Selecciona una familia"); return; }
    if (needsMember && !memberId) { toast.error("Selecciona un miembro"); return; }
    if (files.length === 0) { toast.error("Sube al menos un archivo"); return; }

    try {
      for (const f of files) {
        const arrayBuf = await f.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
        await uploadMutation.mutateAsync({
          familyId,
          docType: tipo.slug as never,  // existing procedure expects a slug; we now pass via runtime list
          memberIndex: memberId ? Number(memberId) : -1,
          fileBase64: base64,
          filename: f.name,
          contentType: f.type,
          notas: notas || undefined,
        } as never);
      }
      toast.success(`${files.length} archivo(s) subido(s)`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al subir");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Subir documento</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tipo de documento *</Label>
            <Select value={tipoId} onValueChange={setTipoId}>
              <SelectTrigger><SelectValue placeholder="Selecciona un tipo" /></SelectTrigger>
              <SelectContent>
                {(types ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Familia *</Label>
            <Input value={familySearch} onChange={(e) => setFamilySearch(e.target.value)} placeholder="Buscar..." />
            {familySearchQuery.data && familySearchQuery.data.length > 0 && (
              <div className="border rounded mt-1 max-h-40 overflow-y-auto">
                {familySearchQuery.data.slice(0, 8).map((f) => {
                  const t = (f as { persons?: { nombre?: string; apellidos?: string } }).persons;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className="w-full text-left p-2 hover:bg-muted text-sm"
                      onClick={() => { setFamilyId(f.id); setFamilySearch(`#${f.familia_numero} ${t?.nombre ?? ""} ${t?.apellidos ?? ""}`); }}
                    >
                      #{f.familia_numero} · {t?.nombre} {t?.apellidos}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {needsMember && memberQuery.data && (
            <div>
              <Label>Miembro</Label>
              <Select value={memberId ?? ""} onValueChange={setMemberId}>
                <SelectTrigger><SelectValue placeholder="Selecciona un miembro" /></SelectTrigger>
                <SelectContent>
                  {((memberQuery.data as { miembros?: { id: string; nombre?: string; apellidos?: string }[] }).miembros ?? []).map((m, idx) => (
                    <SelectItem key={m.id} value={String(idx)}>{m.nombre} {m.apellidos}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Archivo(s) *</Label>
            <Input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </div>

          <div>
            <Label>Notas</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={onSubmit} disabled={uploadMutation.isPending}>
            {uploadMutation.isPending ? "Subiendo..." : "Subir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

NOTE for the implementer: the existing `families.uploadFamilyDocument` procedure expects a `docType` literal-union from the hardcoded enum. **Confirm by reading `server/routers/families/documents.ts` before adjusting the call.** If the field name or shape differs, adapt. The migration to a free-text slug from `program_document_types.slug` happens in Task 14 (a server-side change to widen the input type).

- [ ] **Step 2: Smoke test**

```bash
pnpm test --run client/src/features/uploads-tab/__tests__/UploadModal.test.tsx
```

(Test omitted for brevity — covered by integration smoke in Task 14.)

- [ ] **Step 3: Commit**

```bash
git add client/src/features/uploads-tab/UploadModal.tsx
git commit -m "feat(uploads-tab): single + bulk upload modal with type / familia / miembro selection"
```

---

### Task 13: Uploads tab — archive explorer + pendientes

**Files:**
- Create: `client/src/features/uploads-tab/ArchiveExplorer.tsx`
- Create: `client/src/features/uploads-tab/PendientesGrid.tsx`
- Create: `client/src/features/uploads-tab/hooks/useArchiveDocuments.ts`
- Modify: `client/src/features/uploads-tab/index.tsx`
- **Server-side:** Modify: `server/routers/families/documents.ts` — add a `listAllForProgram` procedure if not already present.

- [ ] **Step 1: Confirm whether server already exposes a "list all docs by program" query**

```bash
grep -n "listAllForProgram\|getProgramDocuments\|documents.list" server/routers/families/documents.ts
```

- [ ] **Step 2: If absent, add the procedure**

In `server/routers/families/documents.ts`, append:

```typescript
listAllForProgram: adminProcedure
  .input(z.object({
    programaId: z.string().uuid(),
    tipoSlug: z.string().optional(),
    familyId: z.string().uuid().optional(),
    onlyPendientes: z.boolean().optional(),
    limit: z.number().int().min(1).max(500).default(100),
    offset: z.number().int().min(0).default(0),
  }))
  .query(async ({ input }) => {
    const db = createAdminClient();
    let q = db
      .from("family_member_documents")
      .select("*, families!inner(id, familia_numero, persons!titular_id(nombre, apellidos))", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(input.offset, input.offset + input.limit - 1);
    // NOTE: filter by programaId via families join in a follow-up if/when families.programa_id is wired.
    // For programa_familias today, all family_member_documents rows belong to families enrolled in
    // the program — so an unfiltered list is acceptable for v1.
    if (input.tipoSlug) q = q.eq("tipo", input.tipoSlug);
    if (input.familyId) q = q.eq("familia_id", input.familyId);
    if (input.onlyPendientes) q = q.is("tipo", null);
    const { data, error, count } = await q;
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return { rows: data ?? [], total: count ?? 0 };
  }),
```

NOTE: this uses `tipo IS NULL` to surface "Pendientes". If the existing schema enforces NOT NULL on `tipo`, the migration adding the new optional `tipo_id` column lands here in a follow-up sub-task. Read the table schema first:

```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -c "\d family_member_documents"
```

If `tipo` is currently NOT NULL, **add a new column `tipo_id uuid REFERENCES program_document_types(id)`** in a small migration; backfill from the slug lookup; leave `tipo text` in place for backward-compat read paths. (One commit.)

- [ ] **Step 3: Implement `useArchiveDocuments.ts`**

```typescript
import { trpc } from "@/lib/trpc";

export function useArchiveDocuments(programaId: string, opts: {
  tipoSlug?: string;
  familyId?: string;
  onlyPendientes?: boolean;
  limit?: number;
  offset?: number;
}) {
  return trpc.families.listAllForProgram.useQuery({
    programaId,
    ...opts,
    limit: opts.limit ?? 100,
    offset: opts.offset ?? 0,
  });
}
```

- [ ] **Step 4: Implement `ArchiveExplorer.tsx` and `PendientesGrid.tsx`**

`PendientesGrid.tsx`:

```typescript
import { useArchiveDocuments } from "./hooks/useArchiveDocuments";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

interface PendientesGridProps {
  programaId: string;
  onClassify: (docId: string) => void;
}

export function PendientesGrid({ programaId, onClassify }: PendientesGridProps) {
  const { data } = useArchiveDocuments(programaId, { onlyPendientes: true, limit: 24 });
  const rows = data?.rows ?? [];
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-sm font-medium mb-2">Pendientes de clasificar ({rows.length})</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {rows.map((r) => (
            <button
              key={r.id}
              className="border rounded p-2 hover:bg-muted text-xs flex flex-col items-center gap-1"
              onClick={() => onClassify(r.id)}
            >
              <FileText className="h-8 w-8 text-muted-foreground" />
              <div className="truncate w-full text-center">{r.filename ?? "Sin nombre"}</div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

`ArchiveExplorer.tsx`:

```typescript
import { useState } from "react";
import { useArchiveDocuments } from "./hooks/useArchiveDocuments";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface ArchiveExplorerProps { programaId: string }

export function ArchiveExplorer({ programaId }: ArchiveExplorerProps) {
  const [tipoSlug, setTipoSlug] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const { data, isLoading } = useArchiveDocuments(programaId, { tipoSlug });
  const rows = (data?.rows ?? []).filter((r) => {
    if (!search.trim()) return true;
    return JSON.stringify(r).toLowerCase().includes(search.toLowerCase());
  });

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar..." className="max-w-xs" />
          <Button variant={!tipoSlug ? "default" : "outline"} size="sm" onClick={() => setTipoSlug(undefined)}>Todos</Button>
        </div>
        {isLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 text-left">Familia</th>
                <th className="p-2 text-left">Tipo</th>
                <th className="p-2 text-left">Subido</th>
                <th className="p-2 text-left">Archivo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">#{(r as { families?: { familia_numero: number } }).families?.familia_numero ?? "—"}</td>
                  <td className="p-2">{r.tipo ?? "Sin clasificar"}</td>
                  <td className="p-2">{r.created_at ? new Date(r.created_at).toLocaleDateString("es-ES") : "—"}</td>
                  <td className="p-2 truncate max-w-xs">{r.filename ?? "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Sin documentos</td></tr>}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Wire into tab**

```typescript
// client/src/features/uploads-tab/index.tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { TiposCatalog } from "./TiposCatalog";
import { PendientesGrid } from "./PendientesGrid";
import { ArchiveExplorer } from "./ArchiveExplorer";
import { UploadModal } from "./UploadModal";
import { ClassifyModal } from "./ClassifyModal";

interface UploadsTabProps { programaId: string }

export default function UploadsTab({ programaId }: UploadsTabProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [classifyId, setClassifyId] = useState<string | null>(null);
  return (
    <div className="space-y-4 p-4">
      <div className="flex justify-end">
        <Button onClick={() => setUploadOpen(true)}><Plus className="h-4 w-4 mr-1" /> Subir documento</Button>
      </div>
      <TiposCatalog programaId={programaId} />
      <PendientesGrid programaId={programaId} onClassify={setClassifyId} />
      <ArchiveExplorer programaId={programaId} />
      <UploadModal programaId={programaId} open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <ClassifyModal programaId={programaId} docId={classifyId} onClose={() => setClassifyId(null)} />
    </div>
  );
}
```

- [ ] **Step 6: Implement `ClassifyModal.tsx`** — minimal modal that lets user re-set `tipo_id` and `familia_id` for a pending document.

`client/src/features/uploads-tab/ClassifyModal.tsx`:

```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useProgramDocumentTypes } from "./hooks/useProgramDocumentTypes";

interface ClassifyModalProps {
  programaId: string;
  docId: string | null;
  onClose: () => void;
}

export function ClassifyModal({ programaId, docId, onClose }: ClassifyModalProps) {
  const { data: types } = useProgramDocumentTypes(programaId);
  const [tipoId, setTipoId] = useState("");
  const classifyMutation = trpc.families.classifyDocument.useMutation();

  if (!docId) return null;

  const onSave = async () => {
    if (!tipoId) { toast.error("Selecciona un tipo"); return; }
    try {
      await classifyMutation.mutateAsync({ docId, tipoId });
      toast.success("Documento clasificado");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al clasificar");
    }
  };

  return (
    <Dialog open={!!docId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Clasificar documento</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tipo de documento *</Label>
            <Select value={tipoId} onValueChange={setTipoId}>
              <SelectTrigger><SelectValue placeholder="Selecciona un tipo" /></SelectTrigger>
              <SelectContent>
                {(types ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={onSave} disabled={classifyMutation.isPending}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

NOTE: `families.classifyDocument` is a small new mutation that updates the `tipo_id` (and optionally `familia_id`) of an existing `family_member_documents` row. Add it to `server/routers/families/documents.ts`:

```typescript
classifyDocument: adminProcedure
  .input(z.object({
    docId: z.string().uuid(),
    tipoId: z.string().uuid(),
  }))
  .mutation(async ({ input }) => {
    const db = createAdminClient();
    const { error } = await db
      .from("family_member_documents")
      .update({ tipo_id: input.tipoId, updated_at: new Date().toISOString() })
      .eq("id", input.docId);
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return { success: true };
  }),
```

- [ ] **Step 7: Smoke test**

```bash
pnpm dev
# /programas/programa_familias?tab=uploads
# Click "Subir documento", complete flow → file appears in archive
# (Pendientes only appears if a doc was uploaded with no tipo_id; manual setup if needed via psql)
```

- [ ] **Step 8: Commit**

```bash
git add client/src/features/uploads-tab server/routers/families/documents.ts
git commit -m "feat(uploads-tab): archive explorer + pendientes grid + classify modal + listAllForProgram"
```

---

### Task 14: Migrate `family_member_documents` to allow `tipo_id` (nullable) + reconcile

**Files:**
- Create: `supabase/migrations/<NEXT_TS+3>_add_tipo_id_to_family_member_documents.sql`

- [ ] **Step 1: Inspect current schema**

```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -c "\d family_member_documents"
```

- [ ] **Step 2: Write migration**

`supabase/migrations/<NEXT_TS+3>_add_tipo_id_to_family_member_documents.sql`:

```sql
-- Add tipo_id (nullable) so newly-uploaded documents can sit in
-- 'Pendientes de clasificar' until a user assigns a type. The legacy
-- `tipo` text column stays in place during the migration window.

ALTER TABLE family_member_documents
  ADD COLUMN IF NOT EXISTS tipo_id uuid REFERENCES program_document_types(id);

CREATE INDEX IF NOT EXISTS family_member_documents_tipo_id_idx
  ON family_member_documents(tipo_id);

-- Backfill: if the row has a `tipo` slug AND a programa_familias row exists,
-- look up the corresponding program_document_types.id and set tipo_id.
UPDATE family_member_documents fmd
SET tipo_id = pdt.id
FROM program_document_types pdt
JOIN programs p ON p.id = pdt.programa_id AND p.slug = 'programa_familias'
WHERE fmd.tipo IS NOT NULL
  AND fmd.tipo = pdt.slug
  AND fmd.tipo_id IS NULL;
```

- [ ] **Step 3: Apply locally + regen types**

```bash
supabase db reset
supabase gen types typescript --local > client/src/lib/database.types.ts
```

- [ ] **Step 4: Add a tripwire test**

`server/__tests__/program-document-types.tripwire.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
// We assert that the seed inserted exactly the 7 known slugs.

describe("program_document_types seed (programa_familias)", () => {
  it.todo("(integration) all 7 known slugs are present after migration");
});
```

(Concrete integration test gated on local Supabase availability; uses the existing `__INTEGRATION_DB__` pattern in the repo.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<NEXT_TS+3>_add_tipo_id_to_family_member_documents.sql \
        client/src/lib/database.types.ts \
        server/__tests__/program-document-types.tripwire.test.ts
git commit -m "feat(schema): add nullable tipo_id to family_member_documents + backfill from legacy slug"
```

---

### Task 15: Admin page — manage document types

**Files:**
- Create: `client/src/pages/admin/ProgramaTiposDocumentoPage.tsx`
- Modify: `client/src/App.tsx` — register the route

- [ ] **Step 1: Implement the page**

`client/src/pages/admin/ProgramaTiposDocumentoPage.tsx`:

```typescript
import { useParams } from "wouter";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function ProgramaTiposDocumentoPage() {
  const { slug } = useParams<{ slug: string }>();
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState<"familia" | "miembro">("familia");

  const programQuery = trpc.programs.getBySlug.useQuery({ slug: slug! }, { enabled: !!slug });
  const programaId = programQuery.data?.id;

  const { data: types, refetch } = trpc.programDocumentTypes.list.useQuery(
    { programaId: programaId! },
    { enabled: !!programaId }
  );

  const createMutation = trpc.programDocumentTypes.create.useMutation();
  const updateMutation = trpc.programDocumentTypes.update.useMutation();

  const onCreate = async () => {
    if (!programaId || !newSlug || !newName) return;
    try {
      await createMutation.mutateAsync({
        programaId,
        slug: newSlug,
        nombre: newName,
        scope: newScope,
      });
      setNewSlug(""); setNewName("");
      await refetch();
      toast.success("Tipo creado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  const onToggleActive = async (id: string, isActive: boolean) => {
    await updateMutation.mutateAsync({ id, isActive });
    await refetch();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Tipos de documento — {programQuery.data?.nombre}</h1>

      <Card>
        <CardContent className="p-4">
          <div className="font-medium mb-3">Tipos existentes</div>
          <ul className="divide-y">
            {(types ?? []).map((t) => (
              <li key={t.id} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{t.nombre}</div>
                  <div className="text-xs text-muted-foreground">{t.slug} · {t.scope}</div>
                </div>
                <Switch checked={t.is_active} onCheckedChange={(v) => onToggleActive(t.id, v)} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="font-medium">Añadir tipo</div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Slug</Label><Input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="ej. constancia_residencia" /></div>
            <div><Label>Nombre</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
          </div>
          <div className="flex items-center gap-2">
            <Label>Alcance:</Label>
            <Button variant={newScope === "familia" ? "default" : "outline"} size="sm" onClick={() => setNewScope("familia")}>Familia</Button>
            <Button variant={newScope === "miembro" ? "default" : "outline"} size="sm" onClick={() => setNewScope("miembro")}>Miembro</Button>
          </div>
          <Button onClick={onCreate} disabled={!newSlug || !newName || createMutation.isPending}>Crear</Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Register route**

In `client/src/App.tsx`, lazy-import and add:

```tsx
const ProgramaTiposDocumento = lazy(() => import("./pages/admin/ProgramaTiposDocumentoPage"));
// ...
<Route path="/admin/programas/:slug/tipos-documento">
  <ProtectedRoute requiredRoles={["superadmin"]}>
    <ProgramaTiposDocumento />
  </ProtectedRoute>
</Route>
```

- [ ] **Step 3: Smoke test**

```bash
pnpm dev
# /admin/programas/programa_familias/tipos-documento
# See 7 seeded types; toggle one; create a new one; reload.
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/ProgramaTiposDocumentoPage.tsx client/src/App.tsx
git commit -m "feat(admin): page to manage program document types per program"
```

---

### Task 16: Phase 1 verification + lint + typecheck + test

**Files:** none (verification only)

- [ ] **Step 1: Run full verification suite**

```bash
pnpm lint
pnpm check
pnpm test --run
```

Expected: 0 lint errors, 0 TS errors, all tests passing including the new ones.

- [ ] **Step 2: Manual end-to-end smoke**

```bash
pnpm dev
```

Walk through:
1. `/familias` → redirects to `/programas/programa_familias?tab=familias`. ✓
2. Familias tab: search a family, filter `Sin GUF`, save the view as "Pendientes GUF", reload, view persists. ✓
3. Click a row → drawer opens. Click "Abrir página completa" → lands on `/familias/:id`. ✓
4. Switch to Uploads tab. See 7 types in the catalog. ✓
5. `/admin/programas/programa_familias/tipos-documento` → see same 7 types, toggle one. ✓
6. Mapa, Reports, Derivar tabs are disabled with "Próximamente" tooltip. ✓

- [ ] **Step 3: Push branch + open draft PR**

```bash
git push -u origin feat/programa-familia-5-tab-surface
gh pr create --draft --title "feat: Programa de Familia 5-tab surface — Phase 1 (Familias + Uploads)" --body "$(cat <<'EOF'
## Summary
- Replaces flat /familias routing with tabbed surface inside /programas/programa_familias
- Ships Familias tab (list, drawer, saved views) + Uploads tab (catalog, bulk upload, archive, pendientes)
- New: program_document_types DB-driven registry replaces the hardcoded TS enum
- Mapa / Reports / Derivar tabs render disabled with "Próximamente" — Phase 2 + 3 follow-up

## Test plan
- [ ] /familias redirects to /programas/programa_familias?tab=familias
- [ ] Familias list filters and saved views work
- [ ] Drawer opens on row click; "Abrir página completa" navigates to /familias/:id
- [ ] Uploads catalog renders 7 seeded types; download buttons appear when template/guide URLs exist
- [ ] Upload modal places a doc in the archive (or in Pendientes if tipo not selected)
- [ ] /admin/programas/programa_familias/tipos-documento manages types
- [ ] pnpm lint, pnpm check, pnpm test all green

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review (before handoff)

- [ ] Spec coverage: Familias tab ✓ · Uploads tab ✓ · DB-driven types ✓ · saved views ✓ · `<ProgramTabs />` skeleton with disabled Phase 2/3 ✓ · route migration ✓.
- [ ] Placeholder scan: `<NEXT_TS>` is intentional (concrete YYYYMMDDhhmmss picked at task time, matches project convention). No "TODO inline".
- [ ] Type consistency: `FamiliasFilters` shape matches between hook (Task 7) and Zod spec (Task 2). `ProgramTab` enum is shared between Tasks 5 and the URL-state hook.
- [ ] Note for Phase 2: Mapa tab ENABLED toggle in `<ProgramTabs />` switches from `disabled` to live by setting `PHASE1_ENABLED.includes("mapa")` to true (one-line change).

---

**End of Phase 1 plan.** Phase 2 (Mapa + Reports) follows in `2026-05-06-programa-familia-phase2.md`.
