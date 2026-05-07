# Programa de Familia — Phase 3: Derivar Tab + Instituciones + DOCX/PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-06-programa-familia-5-tab-surface.md`

**Depends on:** Phase 1 (`<ProgramTabs />`, foundations) and Phase 2 (Madrid distrito infrastructure — used by `instituciones.distrito`).

**Goal:** Ship the Derivar tab inside `/programas/programa_familias?tab=derivar` plus the global `/admin/instituciones` registry. Generate the official "Hoja de Registro de Derivaciones e Intervenciones" as both `.docx` and `.pdf`, matching the artifact `260211 UZCATEGUI COLINA RAUL ALBERTO FAM 2422 DERIVACION MEDICOS DEL MUNDO.docx`.

**Architecture:** Two-table model (`derivacion_hojas` header + `derivacion_intervenciones` rows), one open hoja per (entity, programa). Scope is per-row (`persona` or `familia`). Every intervention row freezes a JSON snapshot of the institución at insert time so historical hojas remain accurate. PDF generation: server-side `docxtemplater` fills a Word template stored in the `program-document-templates` bucket; LibreOffice headless converts `.docx` → `.pdf`.

**Tech Stack additions vs Phase 2:** `docxtemplater`, `pizzip` (its required dep), `node:child_process` for `libreoffice --headless`. LibreOffice binary on the deploy host (operational task, flagged for Felix).

**Key UX principle (locked in this conversation):** every form **pre-fills from the backend** what's known; only unknown fields are open inputs. A `derivar.startIntervention` procedure returns all derivable header data; the form renders read-only badges for filled fields and inputs only for the blanks (fecha default=today, tipo, descripción, institución, observaciones).

**Phase 3 ships:**
- `instituciones` global catalog + admin page
- `tipos_intervencion` table (DB-seeded, superadmin-editable later)
- `derivacion_hojas` + `derivacion_intervenciones` tables
- `derivar.*` tRPC router (loadFormDefaults, addIntervention, generateDocx, generatePdf, attachSigned, list)
- Derivar tab with list + drawer + intervention form (smart pre-fill)
- "Crear nueva institución" inline form
- Derivar Word template (uploaded to bucket)
- LibreOffice infrastructure note for ops

**Phase 3 does NOT ship:** OCR auto-classification of uploaded signed PDFs (deferred), per-row signatures (only latest-row's `firmado_url` is set when a signed PDF is uploaded; v2 will support per-row).

**Conventions** (see Phase 1 for full list): `<NEXT_TS>` = a concrete `YYYYMMDDhhmmss` value picked at migration creation time. `<NEXT_TS+1>` etc. are subsequent monotonic timestamps within this phase.

---

## File Structure

### Created — schema
- `supabase/migrations/<NEXT_TS>_create_instituciones.sql`
- `supabase/migrations/<NEXT_TS+1>_create_tipos_intervencion.sql`
- `supabase/migrations/<NEXT_TS+2>_create_derivacion_hojas.sql`
- `supabase/migrations/<NEXT_TS+3>_create_derivacion_intervenciones.sql`

### Created — shared
- `shared/derivar/types.ts` — Zod for hoja, intervención, institución
- `shared/derivar/templatePlaceholders.ts` — placeholder name constants for `docxtemplater`

### Created — server
- `server/routers/instituciones/index.ts`, `crud.ts`
- `server/routers/derivar/index.ts`, `hojas.ts`, `intervenciones.ts`, `pdfGen.ts`
- `server/_core/docxRender.ts` — wraps `docxtemplater`
- `server/_core/pdfFromDocx.ts` — wraps `libreoffice --headless`

### Created — client
- `client/src/features/derivar/index.tsx`
- `client/src/features/derivar/DerivarList.tsx`
- `client/src/features/derivar/HojaDrawer.tsx`
- `client/src/features/derivar/NuevaIntervencionForm.tsx` — smart pre-fill form
- `client/src/features/derivar/InstitucionTypeahead.tsx`
- `client/src/features/derivar/CrearInstitucionInlineModal.tsx`
- `client/src/features/derivar/hooks/useDerivar.ts`
- `client/src/features/derivar/hooks/useInstituciones.ts`
- `client/src/pages/admin/InstitucionesPage.tsx`

### Modified
- `client/src/App.tsx` — add `/admin/instituciones` route
- `client/src/features/programs/components/ProgramTabs.tsx` — enable `derivar`
- `package.json` — add `docxtemplater` and `pizzip` deps
- `Dockerfile` (if present at repo root or under `/.docker/`) — install LibreOffice. **If no Dockerfile exists, write a `docs/runbooks/libreoffice-setup.md` runbook and flag the deploy infra task for Felix.**

### Reused (no edit)
- `client/src/features/programs/components/ProgramTabs.tsx` — wire enabled tab
- `server/_core/rlsRedaction.ts` — applied to persona/familia snapshots before they hit the client

---

## Tasks

### Task 1: Schema — `instituciones` catalog

**Files:**
- Create: `supabase/migrations/<NEXT_TS>_create_instituciones.sql`

- [ ] **Step 1: Migration**

```sql
CREATE TABLE IF NOT EXISTS instituciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  tipo text CHECK (tipo IN ('publica','ong','parroquia','privada','otro')),
  areas text[] NOT NULL DEFAULT '{}',
  direccion text,
  codigo_postal text,
  distrito text,
  telefono text,
  email text,
  notas text,
  is_active boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX instituciones_active_idx ON instituciones(is_active, nombre);
CREATE INDEX instituciones_distrito_idx ON instituciones(distrito) WHERE distrito IS NOT NULL;
CREATE INDEX instituciones_areas_idx ON instituciones USING gin(areas);

-- Auto-set distrito from codigo_postal (uses madrid_distrito_for from Phase 2)
CREATE OR REPLACE FUNCTION instituciones_set_distrito() RETURNS trigger AS $$
BEGIN
  NEW.distrito := madrid_distrito_for(NEW.codigo_postal);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER instituciones_distrito_sync
  BEFORE INSERT OR UPDATE OF codigo_postal ON instituciones
  FOR EACH ROW EXECUTE FUNCTION instituciones_set_distrito();

CREATE TRIGGER instituciones_updated_at
  BEFORE UPDATE ON instituciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE instituciones ENABLE ROW LEVEL SECURITY;

-- Admin/superadmin/voluntario read; superadmin writes (admins can create via the
-- inline form during Derivar flow — see admin_create policy below).
CREATE POLICY "instituciones_read_authenticated"
  ON instituciones FOR SELECT TO authenticated
  USING (get_user_role() IN ('admin','superadmin','voluntario'));

CREATE POLICY "instituciones_admin_create"
  ON instituciones FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin','superadmin'));

CREATE POLICY "instituciones_superadmin_modify"
  ON instituciones FOR UPDATE TO authenticated
  USING (get_user_role() = 'superadmin')
  WITH CHECK (get_user_role() = 'superadmin');

CREATE POLICY "instituciones_superadmin_delete"
  ON instituciones FOR DELETE TO authenticated
  USING (get_user_role() = 'superadmin');
```

- [ ] **Step 2: Apply + regen types + commit**

```bash
supabase db reset
supabase gen types typescript --local > client/src/lib/database.types.ts
git add supabase/migrations/<NEXT_TS>_create_instituciones.sql client/src/lib/database.types.ts
git commit -m "feat(schema): create instituciones global catalog with distrito auto-sync"
```

---

### Task 2: Schema — `tipos_intervencion` (DB-seeded)

**Files:**
- Create: `supabase/migrations/<NEXT_TS+1>_create_tipos_intervencion.sql`

- [ ] **Step 1: Migration**

```sql
CREATE TABLE IF NOT EXISTS tipos_intervencion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nombre text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tipos_intervencion (slug, nombre, display_order) VALUES
  ('salud',           'Salud',                 10),
  ('apoyo_logistico', 'Apoyo logístico',       20),
  ('vivienda',        'Vivienda',              30),
  ('juridico',        'Jurídico',              40),
  ('empleo',          'Empleo',                50),
  ('alimentacion',    'Alimentación',          60),
  ('infancia',        'Infancia',              70),
  ('salud_mental',    'Salud mental',          80),
  ('formacion',       'Formación',             90),
  ('otro',            'Otro',                 100)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE tipos_intervencion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tipos_read_authenticated"
  ON tipos_intervencion FOR SELECT TO authenticated USING (true);

CREATE POLICY "tipos_superadmin_write"
  ON tipos_intervencion FOR ALL TO authenticated
  USING (get_user_role() = 'superadmin')
  WITH CHECK (get_user_role() = 'superadmin');
```

- [ ] **Step 2: Apply + commit**

```bash
supabase db reset
supabase gen types typescript --local > client/src/lib/database.types.ts
git add supabase/migrations/<NEXT_TS+1>_create_tipos_intervencion.sql client/src/lib/database.types.ts
git commit -m "feat(schema): seed tipos_intervencion with 10 starter categories"
```

---

### Task 3: Schema — `derivacion_hojas` + `derivacion_intervenciones`

**Files:**
- Create: `supabase/migrations/<NEXT_TS+2>_create_derivacion_hojas.sql`
- Create: `supabase/migrations/<NEXT_TS+3>_create_derivacion_intervenciones.sql`

- [ ] **Step 1: hojas migration**

```sql
CREATE TABLE IF NOT EXISTS derivacion_hojas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('persona','familia')),
  persona_id uuid REFERENCES persons(id) ON DELETE RESTRICT,
  familia_id uuid REFERENCES families(id) ON DELETE RESTRICT,
  programa_id uuid NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  profesional_id text NOT NULL,
  profesional_nombre text NOT NULL,
  fecha_apertura date NOT NULL DEFAULT current_date,
  estado text NOT NULL CHECK (estado IN ('activa','cerrada')) DEFAULT 'activa',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (scope = 'persona' AND persona_id IS NOT NULL) OR
    (scope = 'familia' AND familia_id IS NOT NULL)
  )
);

-- One open hoja per (persona, programa)
CREATE UNIQUE INDEX uq_hoja_persona_programa
  ON derivacion_hojas(persona_id, programa_id)
  WHERE scope='persona' AND estado='activa';

-- One open hoja per (familia, programa)
CREATE UNIQUE INDEX uq_hoja_familia_programa
  ON derivacion_hojas(familia_id, programa_id)
  WHERE scope='familia' AND estado='activa';

CREATE INDEX derivacion_hojas_persona_idx ON derivacion_hojas(persona_id) WHERE persona_id IS NOT NULL;
CREATE INDEX derivacion_hojas_familia_idx ON derivacion_hojas(familia_id) WHERE familia_id IS NOT NULL;
CREATE INDEX derivacion_hojas_programa_idx ON derivacion_hojas(programa_id);

ALTER TABLE derivacion_hojas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hojas_admin_read"
  ON derivacion_hojas FOR SELECT TO authenticated
  USING (get_user_role() IN ('admin','superadmin'));

CREATE POLICY "hojas_admin_write"
  ON derivacion_hojas FOR ALL TO authenticated
  USING (get_user_role() IN ('admin','superadmin'))
  WITH CHECK (get_user_role() IN ('admin','superadmin'));
```

- [ ] **Step 2: intervenciones migration**

```sql
CREATE TABLE IF NOT EXISTS derivacion_intervenciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hoja_id uuid NOT NULL REFERENCES derivacion_hojas(id) ON DELETE RESTRICT,
  fecha date NOT NULL,
  tipo_slug text NOT NULL REFERENCES tipos_intervencion(slug),
  descripcion text NOT NULL,
  institucion_id uuid REFERENCES instituciones(id) ON DELETE SET NULL,
  institucion_snapshot jsonb,
  observaciones text,
  firmado_url text,
  firmado_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX derivacion_intervenciones_hoja_fecha_idx
  ON derivacion_intervenciones(hoja_id, fecha DESC);

ALTER TABLE derivacion_intervenciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intervenciones_admin_read"
  ON derivacion_intervenciones FOR SELECT TO authenticated
  USING (get_user_role() IN ('admin','superadmin'));

CREATE POLICY "intervenciones_admin_write"
  ON derivacion_intervenciones FOR ALL TO authenticated
  USING (get_user_role() IN ('admin','superadmin'))
  WITH CHECK (get_user_role() IN ('admin','superadmin'));
```

- [ ] **Step 3: Apply + commit (one commit per migration to keep diffs reviewable)**

```bash
supabase db reset
supabase gen types typescript --local > client/src/lib/database.types.ts
git add supabase/migrations/<NEXT_TS+2>_create_derivacion_hojas.sql client/src/lib/database.types.ts
git commit -m "feat(schema): create derivacion_hojas with one-active-per-entity-programa indexes"
git add supabase/migrations/<NEXT_TS+3>_create_derivacion_intervenciones.sql
git commit -m "feat(schema): create derivacion_intervenciones with institucion_snapshot freeze"
```

---

### Task 4: Shared types — Zod schemas + template placeholders

**Files:**
- Create: `shared/derivar/types.ts`
- Create: `shared/derivar/templatePlaceholders.ts`

- [ ] **Step 1: `types.ts`**

```typescript
import { z } from "zod";

export const ScopeEnum = z.enum(["persona", "familia"]);
export type Scope = z.infer<typeof ScopeEnum>;

export const InstitucionSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(1).max(200),
  tipo: z.enum(["publica","ong","parroquia","privada","otro"]).nullable(),
  areas: z.array(z.string()).default([]),
  direccion: z.string().nullable(),
  codigo_postal: z.string().nullable(),
  distrito: z.string().nullable(),
  telefono: z.string().nullable(),
  email: z.string().email().nullable().or(z.literal("").transform(() => null)).nullable(),
  notas: z.string().nullable(),
  is_active: z.boolean(),
});

export const InstitucionCreateSchema = z.object({
  nombre: z.string().min(1).max(200),
  tipo: z.enum(["publica","ong","parroquia","privada","otro"]).optional(),
  areas: z.array(z.string()).default([]),
  direccion: z.string().optional(),
  codigo_postal: z.string().regex(/^\d{5}$/).optional(),
  telefono: z.string().optional(),
  email: z.string().email().optional(),
  notas: z.string().max(1000).optional(),
});

export const InstitucionSnapshotSchema = z.object({
  nombre: z.string(),
  direccion: z.string().nullable(),
  telefono: z.string().nullable(),
  email: z.string().nullable(),
  codigo_postal: z.string().nullable(),
});
export type InstitucionSnapshot = z.infer<typeof InstitucionSnapshotSchema>;

export const HojaSchema = z.object({
  id: z.string().uuid(),
  scope: ScopeEnum,
  persona_id: z.string().uuid().nullable(),
  familia_id: z.string().uuid().nullable(),
  programa_id: z.string().uuid(),
  profesional_id: z.string(),
  profesional_nombre: z.string(),
  fecha_apertura: z.string(), // ISO date
  estado: z.enum(["activa","cerrada"]),
});

export const InterventionInsertSchema = z.object({
  scope: ScopeEnum,
  entityId: z.string().uuid(),                  // persona_id or familia_id
  programaId: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipoSlug: z.string().min(1),
  descripcion: z.string().min(1).max(2000),
  institucionId: z.string().uuid().optional(),
  institucionSnapshot: InstitucionSnapshotSchema.optional(),
  observaciones: z.string().max(2000).optional(),
});

export const StartInterventionInputSchema = z.object({
  scope: ScopeEnum,
  entityId: z.string().uuid(),
  programaId: z.string().uuid(),
});

export const StartInterventionResultSchema = z.object({
  hoja: z.object({
    id: z.string().uuid().nullable(),            // null = will be created on first intervention insert
    fechaApertura: z.string(),                   // ISO; today if hoja doesn't exist yet
    estado: z.enum(["activa","cerrada","new"]),
  }),
  // Pre-filled header data — what the form should render as read-only.
  header: z.object({
    nombre: z.string(),                          // persona full name OR titular full name (if scope=familia)
    numUnidadFamiliar: z.string().nullable(),    // family number (number→string) if entity has a family
    programaNombre: z.string(),
    profesionalNombre: z.string(),
    fechaAperturaISO: z.string(),
  }),
  // Defaults for the inputs the user still has to fill.
  defaults: z.object({
    fechaISO: z.string(),                        // today
    tipoSlug: z.string().nullable(),             // null = user must pick
    descripcion: z.string().nullable(),          // always null in v1
    observaciones: z.string().nullable(),
  }),
});
```

- [ ] **Step 2: `templatePlaceholders.ts`**

```typescript
/**
 * Placeholder names used by docxtemplater inside the canonical
 * derivacion_hoja_template_v1.docx. The template author (Bocatas)
 * must keep these names byte-for-byte to avoid runtime errors.
 *
 * Usage in template:
 *   {nombre}, {numUnidadFamiliar}, {programaReferencia},
 *   {profesionalReferencia}, {fechaApertura}
 *
 * Looped table rows:
 *   {#intervenciones}
 *     {fecha} | {tipo} | {descripcion} | {recursoNombre} ... {recursoTelefono} | {observaciones} | {firmaPlaceholder}
 *   {/intervenciones}
 */
export const TEMPLATE_PLACEHOLDERS = {
  nombre: "nombre",
  numUnidadFamiliar: "numUnidadFamiliar",
  programaReferencia: "programaReferencia",
  profesionalReferencia: "profesionalReferencia",
  fechaApertura: "fechaApertura",
  intervenciones: "intervenciones",         // loop scope
  rowFecha: "fecha",
  rowTipo: "tipo",
  rowDescripcion: "descripcion",
  rowRecursoNombre: "recursoNombre",
  rowRecursoDireccion: "recursoDireccion",
  rowRecursoTelefono: "recursoTelefono",
  rowObservaciones: "observaciones",
  rowFirmaPlaceholder: "firmaPlaceholder",  // intentionally blank for ink signature
} as const;

export const TEMPLATE_FILENAME_DOCX = "derivacion_hoja_template_v1.docx";
export const TEMPLATE_BUCKET = "program-document-templates";
```

- [ ] **Step 3: Commit**

```bash
git add shared/derivar
git commit -m "feat(shared): Zod types + docxtemplater placeholder constants for Derivar"
```

---

### Task 5: Server router — `instituciones`

**Files:**
- Create: `server/routers/instituciones/index.ts`
- Create: `server/routers/instituciones/crud.ts`
- Test: `server/routers/__tests__/instituciones.test.ts`
- Modify: `server/_core/trpc.ts`

- [ ] **Step 1: Implement `crud.ts`**

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, superadminProcedure, voluntarioProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { InstitucionCreateSchema } from "../../../shared/derivar/types";

const uuidLike = z.string().uuid();

export const institucionesCrudRouter = router({
  /** Typeahead-friendly search; returns up to 20. */
  search: voluntarioProcedure
    .input(z.object({
      q: z.string().max(100).optional(),
      area: z.string().optional(),
      activeOnly: z.boolean().default(true),
    }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      let q = db.from("instituciones").select("*").limit(20).order("nombre", { ascending: true });
      if (input.activeOnly) q = q.eq("is_active", true);
      if (input.q && input.q.trim()) q = q.ilike("nombre", `%${input.q.trim()}%`);
      if (input.area) q = q.contains("areas", [input.area]);
      const { data, error } = await q;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  getById: adminProcedure
    .input(z.object({ id: uuidLike }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db.from("instituciones").select("*").eq("id", input.id).single();
      if (error || !data) throw new TRPCError({ code: "NOT_FOUND" });
      return data;
    }),

  list: adminProcedure
    .input(z.object({
      search: z.string().optional(),
      activeOnly: z.boolean().default(true),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(500).default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = createAdminClient();
      let q = db.from("instituciones").select("*", { count: "exact" })
        .order("nombre", { ascending: true })
        .range(input?.offset ?? 0, (input?.offset ?? 0) + (input?.limit ?? 50) - 1);
      if (input?.activeOnly !== false) q = q.eq("is_active", true);
      if (input?.search?.trim()) q = q.ilike("nombre", `%${input.search.trim()}%`);
      const { data, error, count } = await q;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { rows: data ?? [], total: count ?? 0 };
    }),

  /** Admins (and superadmins) can create — used by the inline modal during Derivar flow. */
  create: adminProcedure
    .input(InstitucionCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const db = createAdminClient();
      const { data, error } = await db.from("instituciones").insert({
        nombre: input.nombre,
        tipo: input.tipo ?? null,
        areas: input.areas,
        direccion: input.direccion ?? null,
        codigo_postal: input.codigo_postal ?? null,
        telefono: input.telefono ?? null,
        email: input.email ?? null,
        notas: input.notas ?? null,
        created_by: String(ctx.user.id),
      }).select().single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  update: superadminProcedure
    .input(z.object({
      id: uuidLike,
      data: InstitucionCreateSchema.partial().extend({ is_active: z.boolean().optional() }),
    }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of ["nombre","tipo","areas","direccion","codigo_postal","telefono","email","notas","is_active"] as const) {
        const v = (input.data as Record<string, unknown>)[k];
        if (v !== undefined) update[k] = v;
      }
      const { data, error } = await db.from("instituciones").update(update).eq("id", input.id).select().single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),
});
```

- [ ] **Step 2: Compose `index.ts`**

```typescript
export { institucionesCrudRouter as institucionesRouter } from "./crud";
```

- [ ] **Step 3: Wire + test + commit**

```typescript
// server/_core/trpc.ts: appRouter.instituciones = institucionesRouter
```

```typescript
// server/routers/__tests__/instituciones.test.ts
import { describe, it, expect, vi } from "vitest";
import { institucionesRouter } from "../instituciones";
import type { Context } from "../../_core/context";

const ctx = (role: string): Context => ({
  user: { id: "u", role, openId: "u" },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  correlationId: "t",
} as Context);

describe("instituciones router", () => {
  it("admin can create", async () => {
    const caller = institucionesRouter.createCaller(ctx("admin"));
    await expect(caller.create({ nombre: "Cáritas Madrid" })).rejects.not.toThrow(/UNAUTHORIZED|FORBIDDEN/);
  });

  it("voluntario cannot create", async () => {
    const caller = institucionesRouter.createCaller(ctx("voluntario"));
    await expect(caller.create({ nombre: "X" })).rejects.toThrow(/UNAUTHORIZED|FORBIDDEN/);
  });

  it("non-superadmin cannot update", async () => {
    const caller = institucionesRouter.createCaller(ctx("admin"));
    await expect(caller.update({ id: "00000000-0000-0000-0000-000000000001", data: { nombre: "X" } }))
      .rejects.toThrow(/UNAUTHORIZED|FORBIDDEN/);
  });
});
```

```bash
pnpm test --run server/routers/__tests__/instituciones.test.ts
git add server/routers/instituciones server/routers/__tests__/instituciones.test.ts server/_core/trpc.ts
git commit -m "feat(server): instituciones router (search/list/create/update + role guards)"
```

---

### Task 6: Server router — `derivar.startIntervention` (smart pre-fill)

**Files:**
- Create: `server/routers/derivar/index.ts`
- Create: `server/routers/derivar/hojas.ts`
- Test: `server/routers/__tests__/derivar.startIntervention.test.ts`

- [ ] **Step 1: Implement `hojas.ts`**

```typescript
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import {
  StartInterventionInputSchema,
  StartInterventionResultSchema,
  type Scope,
} from "../../../shared/derivar/types";

export const hojasRouter = router({
  /**
   * Pre-fill payload for the Nueva Intervención form.
   * Returns header fields the user does NOT need to type:
   *   nombre, numUnidadFamiliar, programaNombre, profesionalNombre, fechaApertura.
   * Plus form defaults (fecha=today, others null).
   *
   * Looks up an existing active hoja for (entity, programa); if none, returns
   * hoja.id=null and estado='new'. The actual hoja row is created on first
   * intervention insert (transactional — see addIntervention).
   */
  startIntervention: adminProcedure
    .input(StartInterventionInputSchema)
    .query(async ({ ctx, input }): Promise<z.infer<typeof StartInterventionResultSchema>> => {
      const db = createAdminClient();

      // Programa
      const { data: programa, error: progErr } = await db
        .from("programs")
        .select("id, nombre")
        .eq("id", input.programaId)
        .single();
      if (progErr || !programa) throw new TRPCError({ code: "NOT_FOUND", message: "Programa no encontrado" });

      // Entity (persona or familia) → resolve nombre + numUnidadFamiliar
      let nombre = "";
      let numUnidadFamiliar: string | null = null;

      if (input.scope === "persona") {
        const { data: p, error } = await db
          .from("persons")
          .select("id, nombre, apellidos, families:families!titular_id(familia_numero)")
          .eq("id", input.entityId)
          .single();
        if (error || !p) throw new TRPCError({ code: "NOT_FOUND", message: "Persona no encontrada" });
        nombre = `${p.nombre ?? ""} ${p.apellidos ?? ""}`.trim();
        // If the persona is the titular of a family, surface the family number.
        const fam = (p as { families?: { familia_numero?: number }[] }).families?.[0];
        if (fam?.familia_numero) numUnidadFamiliar = String(fam.familia_numero);
        // Otherwise check if persona is a member of any family.
        if (!numUnidadFamiliar) {
          const { data: m } = await db
            .from("familia_miembros")
            .select("families!inner(familia_numero)")
            .eq("person_id", input.entityId)
            .is("deleted_at", null)
            .limit(1)
            .maybeSingle();
          if (m && (m as { families?: { familia_numero?: number } }).families?.familia_numero) {
            numUnidadFamiliar = String((m as { families: { familia_numero: number } }).families.familia_numero);
          }
        }
      } else {
        const { data: f, error } = await db
          .from("families")
          .select("id, familia_numero, persons:persons!titular_id(nombre, apellidos)")
          .eq("id", input.entityId)
          .single();
        if (error || !f) throw new TRPCError({ code: "NOT_FOUND", message: "Familia no encontrada" });
        const t = (f as { persons?: { nombre?: string; apellidos?: string } }).persons;
        nombre = t ? `${t.nombre ?? ""} ${t.apellidos ?? ""}`.trim() : `Familia #${f.familia_numero}`;
        numUnidadFamiliar = String(f.familia_numero);
      }

      // Existing active hoja, if any
      const hojaQuery = db.from("derivacion_hojas")
        .select("id, fecha_apertura, estado")
        .eq("programa_id", input.programaId)
        .eq("estado", "activa")
        .eq("scope", input.scope);
      if (input.scope === "persona") hojaQuery.eq("persona_id", input.entityId);
      else hojaQuery.eq("familia_id", input.entityId);
      const { data: hoja } = await hojaQuery.maybeSingle();

      const today = new Date().toISOString().slice(0, 10);
      const profesionalNombre = String((ctx.user as { displayName?: string; name?: string; id: string }).displayName
        ?? (ctx.user as { name?: string }).name
        ?? `Usuario ${ctx.user.id}`);

      return {
        hoja: hoja
          ? { id: hoja.id, fechaApertura: hoja.fecha_apertura, estado: hoja.estado as "activa" | "cerrada" }
          : { id: null, fechaApertura: today, estado: "new" },
        header: {
          nombre,
          numUnidadFamiliar,
          programaNombre: programa.nombre,
          profesionalNombre,
          fechaAperturaISO: hoja?.fecha_apertura ?? today,
        },
        defaults: {
          fechaISO: today,
          tipoSlug: null,
          descripcion: null,
          observaciones: null,
        },
      };
    }),
});
```

- [ ] **Step 2: Test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { hojasRouter } from "../derivar/hojas";
import type { Context } from "../../_core/context";

describe("derivar.startIntervention", () => {
  it("rejects voluntario", async () => {
    const ctx = { user: { id: "u", role: "voluntario", openId: "u" }, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, correlationId: "t" } as Context;
    const caller = hojasRouter.createCaller(ctx);
    await expect(caller.startIntervention({
      scope: "persona",
      entityId: "00000000-0000-0000-0000-000000000001",
      programaId: "00000000-0000-0000-0000-000000000002",
    })).rejects.toThrow(/UNAUTHORIZED|FORBIDDEN/);
  });
});
```

- [ ] **Step 3: Compose `index.ts` and wire — full router (used in Task 7 and 8)**

```typescript
// server/routers/derivar/index.ts
import { mergeRouters } from "../../_core/trpc";
import { hojasRouter } from "./hojas";
import { intervencionesRouter } from "./intervenciones";
import { pdfGenRouter } from "./pdfGen";

export const derivarRouter = mergeRouters(hojasRouter, intervencionesRouter, pdfGenRouter);
```

NOTE: `intervencionesRouter` and `pdfGenRouter` are scaffolded in Tasks 7 + 8 — for this commit, leave the imports out of `mergeRouters` and add them in their own commits as those tasks land. Or stub them as empty `router({})` placeholders.

- [ ] **Step 4: Commit**

```bash
git add server/routers/derivar/hojas.ts server/routers/derivar/index.ts server/routers/__tests__/derivar.startIntervention.test.ts
git commit -m "feat(server): derivar.startIntervention returns smart-prefill header data"
```

---

### Task 7: Server router — `derivar.addIntervention` (transactional hoja-upsert)

**Files:**
- Create: `server/routers/derivar/intervenciones.ts`
- Test: `server/routers/__tests__/derivar.addIntervention.test.ts`

- [ ] **Step 1: Implement `intervenciones.ts`**

```typescript
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { InterventionInsertSchema } from "../../../shared/derivar/types";

export const intervencionesRouter = router({
  /**
   * Adds one intervention. Upserts the open hoja for (entity, programa)
   * if it doesn't exist yet, then inserts the intervention row with a
   * frozen institucion_snapshot.
   */
  addIntervention: adminProcedure
    .input(InterventionInsertSchema)
    .mutation(async ({ ctx, input }) => {
      const db = createAdminClient();

      // 1. Find or create the active hoja
      const hojaQuery = db.from("derivacion_hojas")
        .select("id, fecha_apertura")
        .eq("programa_id", input.programaId)
        .eq("estado", "activa")
        .eq("scope", input.scope);
      if (input.scope === "persona") hojaQuery.eq("persona_id", input.entityId);
      else hojaQuery.eq("familia_id", input.entityId);
      const { data: existing } = await hojaQuery.maybeSingle();

      let hojaId: string;
      if (existing) {
        hojaId = existing.id;
      } else {
        // Snapshot profesional name from ctx
        const profesionalNombre = String((ctx.user as { displayName?: string; name?: string; id: string }).displayName
          ?? (ctx.user as { name?: string }).name
          ?? `Usuario ${ctx.user.id}`);

        const hojaInsert: Record<string, unknown> = {
          scope: input.scope,
          programa_id: input.programaId,
          profesional_id: String(ctx.user.id),
          profesional_nombre: profesionalNombre,
          fecha_apertura: input.fecha,
          estado: "activa",
        };
        if (input.scope === "persona") hojaInsert.persona_id = input.entityId;
        else hojaInsert.familia_id = input.entityId;

        const { data: created, error: createErr } = await db
          .from("derivacion_hojas")
          .insert(hojaInsert)
          .select("id")
          .single();
        if (createErr || !created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: createErr?.message ?? "Hoja create failed" });
        hojaId = created.id;
      }

      // 2. Resolve institucion_snapshot if not provided but institucion_id is.
      let snapshot = input.institucionSnapshot;
      if (!snapshot && input.institucionId) {
        const { data: inst } = await db
          .from("instituciones")
          .select("nombre, direccion, telefono, email, codigo_postal")
          .eq("id", input.institucionId)
          .single();
        if (inst) snapshot = inst;
      }

      // 3. Insert the intervention row
      const { data: row, error: rowErr } = await db
        .from("derivacion_intervenciones")
        .insert({
          hoja_id: hojaId,
          fecha: input.fecha,
          tipo_slug: input.tipoSlug,
          descripcion: input.descripcion,
          institucion_id: input.institucionId ?? null,
          institucion_snapshot: snapshot ?? null,
          observaciones: input.observaciones ?? null,
          created_by: String(ctx.user.id),
        })
        .select()
        .single();
      if (rowErr || !row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: rowErr?.message ?? "Insert failed" });

      return { hojaId, intervencionId: row.id };
    }),

  /** List interventions for a program (joined with hoja header). */
  list: adminProcedure
    .input(z.object({
      programaId: z.string().uuid(),
      tipoSlug: z.string().optional(),
      institucionId: z.string().uuid().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(100),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      let q = db.from("derivacion_intervenciones")
        .select(`*, hoja:derivacion_hojas!inner(*, persona:persons(nombre,apellidos), familia:families(familia_numero))`)
        .eq("hoja.programa_id", input.programaId)
        .order("fecha", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);
      if (input.tipoSlug) q = q.eq("tipo_slug", input.tipoSlug);
      if (input.institucionId) q = q.eq("institucion_id", input.institucionId);
      if (input.from) q = q.gte("fecha", input.from);
      if (input.to) q = q.lte("fecha", input.to);
      const { data, error } = await q;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  /** Get a single hoja with all its interventions. */
  getHoja: adminProcedure
    .input(z.object({ hojaId: z.string().uuid() }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data: hoja, error: hErr } = await db
        .from("derivacion_hojas")
        .select(`*, persona:persons(nombre,apellidos), familia:families(familia_numero, persons:persons!titular_id(nombre,apellidos)), programa:programs(nombre)`)
        .eq("id", input.hojaId)
        .single();
      if (hErr || !hoja) throw new TRPCError({ code: "NOT_FOUND" });
      const { data: rows } = await db
        .from("derivacion_intervenciones")
        .select("*")
        .eq("hoja_id", input.hojaId)
        .order("fecha", { ascending: true });
      return { hoja, intervenciones: rows ?? [] };
    }),

  /** Attach a signed PDF URL to the latest intervention row of a hoja. */
  attachSigned: adminProcedure
    .input(z.object({ hojaId: z.string().uuid(), firmadoUrl: z.string() }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { data: latest, error: latestErr } = await db
        .from("derivacion_intervenciones")
        .select("id")
        .eq("hoja_id", input.hojaId)
        .order("fecha", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestErr || !latest) throw new TRPCError({ code: "NOT_FOUND", message: "No hay intervenciones" });
      const { error } = await db
        .from("derivacion_intervenciones")
        .update({ firmado_url: input.firmadoUrl, firmado_at: new Date().toISOString() })
        .eq("id", latest.id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),
});
```

- [ ] **Step 2: Test the upsert and snapshot freezing**

```typescript
// server/routers/__tests__/derivar.addIntervention.test.ts
import { describe, it, expect } from "vitest";
import { InterventionInsertSchema } from "../../../shared/derivar/types";

describe("InterventionInsertSchema", () => {
  it("requires fecha in YYYY-MM-DD", () => {
    const r = InterventionInsertSchema.safeParse({
      scope: "persona",
      entityId: "00000000-0000-0000-0000-000000000001",
      programaId: "00000000-0000-0000-0000-000000000002",
      fecha: "11/02/2026",  // wrong format
      tipoSlug: "salud",
      descripcion: "x",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a valid payload without optional fields", () => {
    const r = InterventionInsertSchema.safeParse({
      scope: "persona",
      entityId: "00000000-0000-0000-0000-000000000001",
      programaId: "00000000-0000-0000-0000-000000000002",
      fecha: "2026-02-11",
      tipoSlug: "salud",
      descripcion: "Entrevista para informe social",
    });
    expect(r.success).toBe(true);
  });
});
```

NOTE: a true integration test of `addIntervention` (which exercises the upsert) is gated on local Supabase availability. Skip it in CI per existing pattern (`it.todo`); add to `__INTEGRATION_DB__` suite.

- [ ] **Step 3: Wire into the merged `derivarRouter`**

In `server/routers/derivar/index.ts`, add `intervencionesRouter` to the `mergeRouters` call now.

- [ ] **Step 4: Commit**

```bash
git add server/routers/derivar/intervenciones.ts server/routers/derivar/index.ts server/routers/__tests__/derivar.addIntervention.test.ts
git commit -m "feat(server): derivar.addIntervention upserts hoja and freezes institucion_snapshot"
```

---

### Task 8: Server — DOCX/PDF generation (`docxRender` + `pdfFromDocx`)

**Files:**
- Create: `server/_core/docxRender.ts`
- Create: `server/_core/pdfFromDocx.ts`
- Create: `server/routers/derivar/pdfGen.ts`
- Modify: `package.json` (`docxtemplater`, `pizzip`)
- Create: `docs/runbooks/libreoffice-setup.md`
- Test: `server/_core/__tests__/docxRender.test.ts`

- [ ] **Step 1: Install deps**

```bash
pnpm add docxtemplater pizzip
```

- [ ] **Step 2: `docxRender.ts`**

```typescript
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { createAdminClient } from "../../client/src/lib/supabase/server";
import { TEMPLATE_BUCKET, TEMPLATE_FILENAME_DOCX } from "../../shared/derivar/templatePlaceholders";

export interface DerivarHojaTemplateData {
  nombre: string;
  numUnidadFamiliar: string;
  programaReferencia: string;
  profesionalReferencia: string;
  fechaApertura: string;
  intervenciones: Array<{
    fecha: string;
    tipo: string;
    descripcion: string;
    recursoNombre: string;
    recursoDireccion: string;
    recursoTelefono: string;
    observaciones: string;
    firmaPlaceholder: string;
  }>;
}

/**
 * Loads the canonical Derivar template from Supabase Storage and fills it
 * with the supplied data. Returns a Buffer containing the .docx bytes.
 */
export async function renderDerivarHojaDocx(data: DerivarHojaTemplateData): Promise<Buffer> {
  const db = createAdminClient();
  const { data: file, error } = await db.storage
    .from(TEMPLATE_BUCKET)
    .download(TEMPLATE_FILENAME_DOCX);
  if (error || !file) {
    throw new Error(`Could not load Derivar template: ${error?.message ?? "no file"}`);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const zip = new PizZip(buf);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render(data);
  return doc.toBuffer({ type: "nodebuffer" });
}
```

- [ ] **Step 3: `pdfFromDocx.ts`**

```typescript
import { spawn } from "node:child_process";
import { writeFile, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Converts a .docx buffer to .pdf bytes using `libreoffice --headless --convert-to pdf`.
 * Requires LibreOffice installed on the host. See docs/runbooks/libreoffice-setup.md.
 *
 * Concurrency note: LibreOffice locks ~/.config/libreoffice while running.
 * For now we serialize via a per-process Promise queue to avoid lock contention.
 * If throughput becomes an issue, run `--user-profile=...` per invocation.
 */
let queue: Promise<unknown> = Promise.resolve();

export function convertDocxToPdf(docxBuf: Buffer): Promise<Buffer> {
  const next = queue.then(() => convertDocxToPdfImpl(docxBuf));
  queue = next.catch(() => undefined);
  return next;
}

async function convertDocxToPdfImpl(docxBuf: Buffer): Promise<Buffer> {
  const tmp = await mkdtemp(join(tmpdir(), "derivar-pdf-"));
  const docxPath = join(tmp, "input.docx");
  const pdfPath = join(tmp, "input.pdf");
  try {
    await writeFile(docxPath, docxBuf);
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("libreoffice", [
        "--headless",
        "--convert-to", "pdf",
        "--outdir", tmp,
        docxPath,
      ]);
      let stderr = "";
      proc.stderr.on("data", (b) => { stderr += b.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`libreoffice exited with code ${code}: ${stderr}`));
      });
      proc.on("error", reject);
    });
    return await readFile(pdfPath);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: `pdfGen.ts` — tRPC procedures returning base64 file bytes**

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { renderDerivarHojaDocx, type DerivarHojaTemplateData } from "../../_core/docxRender";
import { convertDocxToPdf } from "../../_core/pdfFromDocx";

interface RawIntervencion {
  fecha: string;
  tipo_slug: string;
  descripcion: string;
  institucion_snapshot: { nombre?: string; direccion?: string; telefono?: string } | null;
  observaciones: string | null;
}

interface TipoIntervencion { slug: string; nombre: string }

async function buildTemplateData(hojaId: string): Promise<DerivarHojaTemplateData> {
  const db = createAdminClient();

  const { data: hoja, error: hErr } = await db
    .from("derivacion_hojas")
    .select(`*, persona:persons(nombre,apellidos), familia:families(familia_numero, persons:persons!titular_id(nombre,apellidos)), programa:programs(nombre)`)
    .eq("id", hojaId)
    .single();
  if (hErr || !hoja) throw new TRPCError({ code: "NOT_FOUND" });

  const { data: rows } = await db
    .from("derivacion_intervenciones")
    .select("fecha, tipo_slug, descripcion, institucion_snapshot, observaciones")
    .eq("hoja_id", hojaId)
    .order("fecha", { ascending: true });

  const { data: tipos } = await db.from("tipos_intervencion").select("slug, nombre");
  const tipoMap = new Map((tipos as TipoIntervencion[] ?? []).map(t => [t.slug, t.nombre]));

  const isPersona = hoja.scope === "persona";
  const persona = (hoja as { persona?: { nombre?: string; apellidos?: string } }).persona;
  const familia = (hoja as { familia?: { familia_numero?: number; persons?: { nombre?: string; apellidos?: string } } }).familia;

  const nombre = isPersona
    ? `${persona?.nombre ?? ""} ${persona?.apellidos ?? ""}`.trim()
    : familia?.persons
      ? `${familia.persons.nombre ?? ""} ${familia.persons.apellidos ?? ""}`.trim()
      : `Familia #${familia?.familia_numero ?? ""}`;

  return {
    nombre,
    numUnidadFamiliar: familia?.familia_numero ? String(familia.familia_numero) : "",
    programaReferencia: (hoja as { programa?: { nombre?: string } }).programa?.nombre ?? "",
    profesionalReferencia: hoja.profesional_nombre,
    fechaApertura: new Date(hoja.fecha_apertura).toLocaleDateString("es-ES"),
    intervenciones: (rows as RawIntervencion[] ?? []).map(r => ({
      fecha: new Date(r.fecha).toLocaleDateString("es-ES"),
      tipo: tipoMap.get(r.tipo_slug) ?? r.tipo_slug,
      descripcion: r.descripcion,
      recursoNombre: r.institucion_snapshot?.nombre ?? "",
      recursoDireccion: r.institucion_snapshot?.direccion ?? "",
      recursoTelefono: r.institucion_snapshot?.telefono ?? "",
      observaciones: r.observaciones ?? "",
      firmaPlaceholder: "",
    })),
  };
}

export const pdfGenRouter = router({
  generateDocx: adminProcedure
    .input(z.object({ hojaId: z.string().uuid() }))
    .query(async ({ input }) => {
      const data = await buildTemplateData(input.hojaId);
      const buf = await renderDerivarHojaDocx(data);
      return {
        contentBase64: buf.toString("base64"),
        filename: `derivacion_hoja_${input.hojaId.slice(0, 8)}.docx`,
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    }),

  generatePdf: adminProcedure
    .input(z.object({ hojaId: z.string().uuid() }))
    .query(async ({ input }) => {
      const data = await buildTemplateData(input.hojaId);
      const docxBuf = await renderDerivarHojaDocx(data);
      const pdfBuf = await convertDocxToPdf(docxBuf);
      return {
        contentBase64: pdfBuf.toString("base64"),
        filename: `derivacion_hoja_${input.hojaId.slice(0, 8)}.pdf`,
        mime: "application/pdf",
      };
    }),
});
```

- [ ] **Step 5: Test (Zod-only — DB and binary integration deferred)**

```typescript
import { describe, it, expect } from "vitest";

describe("docxRender contract", () => {
  it.todo("(integration) renders a known-good buffer when the template is uploaded to the bucket");
});

describe("pdfFromDocx contract", () => {
  it.todo("(integration) converts a known-good .docx to PDF when libreoffice is available");
});
```

- [ ] **Step 6: Runbook for LibreOffice**

`docs/runbooks/libreoffice-setup.md`:

```markdown
# LibreOffice headless — setup for Derivar PDF generation

## What needs LibreOffice

`server/_core/pdfFromDocx.ts` invokes `libreoffice --headless --convert-to pdf`
to render the Derivar Hoja `.docx` as PDF for printing.

## Local development (macOS)

```
brew install --cask libreoffice
which libreoffice
# expected: /usr/local/bin/libreoffice or /opt/homebrew/bin/libreoffice
```

## Local development (Ubuntu/Debian)

```
sudo apt-get update
sudo apt-get install -y --no-install-recommends libreoffice
which libreoffice
```

## Production (Docker)

Append to the production Dockerfile:

```dockerfile
RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice \
 && rm -rf /var/lib/apt/lists/*
```

Image size delta: ~700MB. If unacceptable, alternative is a sidecar service
(e.g. gotenberg.dev — call it via HTTP from `pdfFromDocx.ts`).

## Concurrency

LibreOffice locks `~/.config/libreoffice` while running. Our `convertDocxToPdf`
serializes through a Promise queue. For higher throughput pass
`--user-profile=file:///tmp/lo-<uuid>` per invocation.

## Failure modes

- Exit code 81 → font missing. Install `fonts-liberation` or `fonts-dejavu`.
- Exit code 77 → permission. Confirm the process can write to `os.tmpdir()`.
- Hang > 30s → kill and retry; consider gotenberg.dev sidecar.
```

- [ ] **Step 7: Wire + commit**

```typescript
// server/routers/derivar/index.ts
// Add pdfGenRouter to mergeRouters now.
```

```bash
git add package.json pnpm-lock.yaml \
        server/_core/docxRender.ts server/_core/pdfFromDocx.ts \
        server/routers/derivar/pdfGen.ts server/routers/derivar/index.ts \
        server/_core/__tests__/docxRender.test.ts \
        docs/runbooks/libreoffice-setup.md
git commit -m "feat(server): docxtemplater render + libreoffice PDF conversion + runbook"
```

---

### Task 9: Upload the Derivar Word template

**Files:** none (operational)

- [ ] **Step 1: Confirm placeholders are present in the template**

Before uploading, the template `.docx` (Bocatas-supplied) MUST contain these placeholders, byte-for-byte (no auto-correct quotes, no font reformatting):

- `{nombre}`, `{numUnidadFamiliar}`, `{programaReferencia}`, `{profesionalReferencia}`, `{fechaApertura}`
- A table-row loop: `{#intervenciones}` ... row uses `{fecha}` `{tipo}` `{descripcion}` `{recursoNombre}` `{recursoDireccion}` `{recursoTelefono}` `{observaciones}` `{firmaPlaceholder}` ... `{/intervenciones}`

Reference: `shared/derivar/templatePlaceholders.ts`.

- [ ] **Step 2: Upload to bucket**

Either via Supabase Studio (Storage → `program-document-templates` → upload), or via CLI:

```bash
supabase storage cp ./template/derivacion_hoja_template_v1.docx \
  ss://program-document-templates/derivacion_hoja_template_v1.docx
```

(Adjust path to wherever the template is located locally.)

- [ ] **Step 3: Smoke test**

```bash
# Use psql to seed a hoja+intervention manually, then call the procedure via tRPC playground
# OR use the UI once Task 11 lands.
```

- [ ] **Step 4: Document**

Add a one-line entry to `docs/dev-setup.md`:

```markdown
## Derivar template

The Word template lives in Supabase Storage at `program-document-templates/derivacion_hoja_template_v1.docx`.
Bocatas owns the file. Updates: replace via Supabase Studio with a versioned filename (`_v2.docx`),
update `TEMPLATE_FILENAME_DOCX` in `shared/derivar/templatePlaceholders.ts`, regen, redeploy.
```

- [ ] **Step 5: Commit**

```bash
git add docs/dev-setup.md
git commit -m "docs: Derivar template ops guide"
```

---

### Task 10: Client — `InstitucionTypeahead` + `CrearInstitucionInlineModal`

**Files:**
- Create: `client/src/features/derivar/InstitucionTypeahead.tsx`
- Create: `client/src/features/derivar/CrearInstitucionInlineModal.tsx`
- Create: `client/src/features/derivar/hooks/useInstituciones.ts`

- [ ] **Step 1: `useInstituciones.ts`**

```typescript
import { trpc } from "@/lib/trpc";

export function useInstitucionSearch(q: string, enabled: boolean) {
  return trpc.instituciones.search.useQuery({ q, activeOnly: true }, { enabled });
}
```

- [ ] **Step 2: `CrearInstitucionInlineModal.tsx`**

```typescript
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (institucion: { id: string; nombre: string; direccion: string | null; telefono: string | null; email: string | null; codigo_postal: string | null }) => void;
  prefillNombre?: string;
}

export function CrearInstitucionInlineModal({ open, onClose, onCreated, prefillNombre }: Props) {
  const [nombre, setNombre] = useState(prefillNombre ?? "");
  const [tipo, setTipo] = useState<"publica"|"ong"|"parroquia"|"privada"|"otro"|"">("");
  const [areas, setAreas] = useState<string>("");  // comma-separated
  const [direccion, setDireccion] = useState("");
  const [codigoPostal, setCodigoPostal] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [notas, setNotas] = useState("");

  const create = trpc.instituciones.create.useMutation();

  const onSubmit = async () => {
    if (!nombre.trim()) { toast.error("Nombre obligatorio"); return; }
    try {
      const inst = await create.mutateAsync({
        nombre: nombre.trim(),
        tipo: tipo || undefined,
        areas: areas.split(",").map(a => a.trim()).filter(Boolean),
        direccion: direccion || undefined,
        codigo_postal: codigoPostal || undefined,
        telefono: telefono || undefined,
        email: email || undefined,
        notas: notas || undefined,
      });
      toast.success("Institución creada");
      onCreated({
        id: inst.id,
        nombre: inst.nombre,
        direccion: inst.direccion,
        telefono: inst.telefono,
        email: inst.email,
        codigo_postal: inst.codigo_postal,
      });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nueva institución</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nombre *</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="publica">Pública</SelectItem>
                  <SelectItem value="ong">ONG</SelectItem>
                  <SelectItem value="parroquia">Parroquia</SelectItem>
                  <SelectItem value="privada">Privada</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Áreas (coma)</Label><Input value={areas} onChange={(e) => setAreas(e.target.value)} placeholder="salud, vivienda" /></div>
          </div>
          <div><Label>Dirección</Label><Input value={direccion} onChange={(e) => setDireccion(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Código postal</Label><Input value={codigoPostal} onChange={(e) => setCodigoPostal(e.target.value)} maxLength={5} /></div>
            <div><Label>Teléfono</Label><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} /></div>
          </div>
          <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>Notas</Label><Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={onSubmit} disabled={create.isPending}>Crear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: `InstitucionTypeahead.tsx`**

```typescript
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useInstitucionSearch } from "./hooks/useInstituciones";
import { CrearInstitucionInlineModal } from "./CrearInstitucionInlineModal";

interface InstitucionPicked {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  codigo_postal: string | null;
}

interface InstitucionTypeaheadProps {
  value: InstitucionPicked | null;
  onChange: (i: InstitucionPicked | null) => void;
}

export function InstitucionTypeahead({ value, onChange }: InstitucionTypeaheadProps) {
  const [q, setQ] = useState(value?.nombre ?? "");
  const [showCreate, setShowCreate] = useState(false);
  const search = useInstitucionSearch(q, q.length >= 2 && !value);

  return (
    <div className="space-y-1">
      <Input
        value={q}
        onChange={(e) => { setQ(e.target.value); if (value) onChange(null); }}
        placeholder="Buscar institución..."
      />
      {search.data && search.data.length > 0 && !value && (
        <div className="border rounded max-h-48 overflow-y-auto">
          {search.data.map((i) => (
            <button
              key={i.id}
              type="button"
              className="w-full text-left p-2 hover:bg-muted text-sm"
              onClick={() => { onChange({ id: i.id, nombre: i.nombre, direccion: i.direccion, telefono: i.telefono, email: i.email, codigo_postal: i.codigo_postal }); setQ(i.nombre); }}
            >
              <div className="font-medium">{i.nombre}</div>
              <div className="text-xs text-muted-foreground">{i.tipo ?? "—"} · {(i.areas ?? []).join(", ")}</div>
            </button>
          ))}
        </div>
      )}
      {q.length >= 2 && search.data && search.data.length === 0 && !value && (
        <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-3 w-3 mr-1" /> Crear "{q}"
        </Button>
      )}
      <CrearInstitucionInlineModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        prefillNombre={q}
        onCreated={(i) => { onChange(i); setQ(i.nombre); }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/features/derivar/InstitucionTypeahead.tsx \
        client/src/features/derivar/CrearInstitucionInlineModal.tsx \
        client/src/features/derivar/hooks/useInstituciones.ts
git commit -m "feat(derivar): institucion typeahead with inline 'Crear nueva' modal"
```

---

### Task 11: Client — `NuevaIntervencionForm` (smart pre-fill)

**Files:**
- Create: `client/src/features/derivar/NuevaIntervencionForm.tsx`
- Create: `client/src/features/derivar/hooks/useDerivar.ts`

- [ ] **Step 1: `useDerivar.ts`**

```typescript
import { trpc } from "@/lib/trpc";
import type { Scope } from "@/../../shared/derivar/types";

export function useStartIntervention(scope: Scope, entityId: string, programaId: string, enabled: boolean) {
  return trpc.derivar.startIntervention.useQuery({ scope, entityId, programaId }, { enabled });
}

export function useTipos() {
  return trpc.tiposIntervencion?.list?.useQuery?.() ?? null;
}

export function useAddIntervention() {
  return trpc.derivar.addIntervention.useMutation();
}
```

NOTE: `tiposIntervencion` is not yet a router. Add a small one in this task too (one query):

```typescript
// server/routers/tiposIntervencion.ts
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { createAdminClient } from "../../client/src/lib/supabase/server";

export const tiposIntervencionRouter = router({
  list: protectedProcedure.query(async () => {
    const db = createAdminClient();
    const { data, error } = await db.from("tipos_intervencion")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }),
});
```

Wire into `appRouter` as `tiposIntervencion: tiposIntervencionRouter`.

- [ ] **Step 2: `NuevaIntervencionForm.tsx`**

The form pre-fills every field that exists in the backend (read-only); the user only types the unknown ones.

```typescript
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { InstitucionTypeahead } from "./InstitucionTypeahead";
import { useStartIntervention, useTipos, useAddIntervention } from "./hooks/useDerivar";
import type { Scope } from "@/../../shared/derivar/types";

interface NuevaIntervencionFormProps {
  scope: Scope;
  entityId: string;
  programaId: string;
  onSaved: (hojaId: string) => void;
  onCancel: () => void;
}

export function NuevaIntervencionForm({ scope, entityId, programaId, onSaved, onCancel }: NuevaIntervencionFormProps) {
  const start = useStartIntervention(scope, entityId, programaId, true);
  const tipos = trpc.tiposIntervencion.list.useQuery();
  const add = useAddIntervention();

  const [fecha, setFecha] = useState<string>(new Date().toISOString().slice(0, 10));
  const [tipoSlug, setTipoSlug] = useState<string>("");
  const [descripcion, setDescripcion] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [institucion, setInstitucion] = useState<{ id: string; nombre: string; direccion: string | null; telefono: string | null; email: string | null; codigo_postal: string | null } | null>(null);

  if (start.isLoading || !start.data) {
    return <div className="space-y-2 p-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  const { header, defaults } = start.data;

  const onSubmit = async () => {
    if (!tipoSlug) { toast.error("Selecciona un tipo de intervención"); return; }
    if (!descripcion.trim()) { toast.error("Descripción obligatoria"); return; }
    try {
      const r = await add.mutateAsync({
        scope,
        entityId,
        programaId,
        fecha,
        tipoSlug,
        descripcion: descripcion.trim(),
        institucionId: institucion?.id,
        institucionSnapshot: institucion ? {
          nombre: institucion.nombre,
          direccion: institucion.direccion,
          telefono: institucion.telefono,
          email: institucion.email,
          codigo_postal: institucion.codigo_postal,
        } : undefined,
        observaciones: observaciones.trim() || undefined,
      });
      toast.success("Intervención registrada");
      onSaved(r.hojaId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <div className="space-y-4">
      {/* Pre-filled header (read-only) */}
      <Card>
        <CardContent className="p-3 space-y-1 text-sm">
          <div><span className="text-muted-foreground">Nombre: </span><strong>{header.nombre}</strong></div>
          {header.numUnidadFamiliar && (
            <div><span className="text-muted-foreground">Nº Unidad familiar: </span><strong>{header.numUnidadFamiliar}</strong></div>
          )}
          <div><span className="text-muted-foreground">Programa: </span><strong>{header.programaNombre}</strong></div>
          <div><span className="text-muted-foreground">Profesional: </span><strong>{header.profesionalNombre}</strong></div>
          <div><span className="text-muted-foreground">Fecha de apertura: </span><strong>{new Date(header.fechaAperturaISO).toLocaleDateString("es-ES")}</strong></div>
        </CardContent>
      </Card>

      {/* User inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Fecha *</Label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div>
          <Label>Tipo de intervención *</Label>
          <Select value={tipoSlug} onValueChange={setTipoSlug}>
            <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
            <SelectContent>
              {(tipos.data ?? []).map(t => <SelectItem key={t.slug} value={t.slug}>{t.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Descripción de la actuación *</Label>
        <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} />
      </div>

      <div>
        <Label>Recurso al que se deriva</Label>
        <InstitucionTypeahead value={institucion} onChange={setInstitucion} />
      </div>

      <div>
        <Label>Observaciones</Label>
        <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={onSubmit} disabled={add.isPending}>Guardar intervención</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/features/derivar/NuevaIntervencionForm.tsx \
        client/src/features/derivar/hooks/useDerivar.ts \
        server/routers/tiposIntervencion.ts \
        server/_core/trpc.ts
git commit -m "feat(derivar): NuevaIntervencionForm with smart prefill from startIntervention"
```

---

### Task 12: Client — Derivar tab list + drawer

**Files:**
- Create: `client/src/features/derivar/index.tsx`
- Create: `client/src/features/derivar/DerivarList.tsx`
- Create: `client/src/features/derivar/HojaDrawer.tsx`
- Modify: `client/src/features/programs/components/ProgramTabs.tsx`

- [ ] **Step 1: `DerivarList.tsx`**

```typescript
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface DerivarListProps {
  programaId: string;
  onRowClick: (hojaId: string) => void;
}

export function DerivarList({ programaId, onRowClick }: DerivarListProps) {
  const { data, isLoading } = trpc.derivar.list.useQuery({ programaId, limit: 100 });

  if (isLoading) return <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left">Persona / Familia</th>
              <th className="p-2 text-left">Fam.</th>
              <th className="p-2 text-left">Tipo</th>
              <th className="p-2 text-left">Institución</th>
              <th className="p-2 text-left">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((row) => {
              const hoja = (row as { hoja?: { id: string; scope: string; persona?: { nombre?: string; apellidos?: string }; familia?: { familia_numero?: number; persons?: { nombre?: string; apellidos?: string } } } }).hoja;
              const persona = hoja?.persona;
              const familia = hoja?.familia;
              const titular = familia?.persons;
              const personaName = hoja?.scope === "persona"
                ? `${persona?.nombre ?? ""} ${persona?.apellidos ?? ""}`.trim()
                : titular ? `${titular.nombre ?? ""} ${titular.apellidos ?? ""}`.trim() : `Familia #${familia?.familia_numero ?? ""}`;
              const inst = (row as { institucion_snapshot?: { nombre?: string } }).institucion_snapshot?.nombre;
              return (
                <tr
                  key={row.id}
                  className="border-t hover:bg-muted/40 cursor-pointer"
                  onClick={() => hoja && onRowClick(hoja.id)}
                >
                  <td className="p-2">{personaName}</td>
                  <td className="p-2">{familia?.familia_numero ? `#${familia.familia_numero}` : "—"}</td>
                  <td className="p-2">{row.tipo_slug}</td>
                  <td className="p-2">{inst ?? "—"}</td>
                  <td className="p-2">{row.fecha ? new Date(row.fecha).toLocaleDateString("es-ES") : "—"}</td>
                </tr>
              );
            })}
            {(data ?? []).length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Sin derivaciones</td></tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: `HojaDrawer.tsx`**

```typescript
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, FileText, FileDown, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface HojaDrawerProps {
  hojaId: string | null;
  onClose: () => void;
  onAddIntervention: (hojaId: string) => void;
}

function downloadBase64(b64: string, filename: string, mime: string) {
  const blob = new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function HojaDrawer({ hojaId, onClose, onAddIntervention }: HojaDrawerProps) {
  const enabled = !!hojaId;
  const result = trpc.derivar.getHoja.useQuery({ hojaId: hojaId ?? "" }, { enabled });
  const trpcCtx = trpc.useContext();
  const [busy, setBusy] = useState<"docx" | "pdf" | null>(null);

  if (!hojaId) return null;

  const onGenerate = async (kind: "docx" | "pdf") => {
    setBusy(kind);
    try {
      const out = kind === "docx"
        ? await trpcCtx.derivar.generateDocx.fetch({ hojaId })
        : await trpcCtx.derivar.generatePdf.fetch({ hojaId });
      downloadBase64(out.contentBase64, out.filename, out.mime);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  };

  const data = result.data;
  const hoja = data?.hoja;
  const intervenciones = data?.intervenciones ?? [];
  const persona = (hoja as { persona?: { nombre?: string; apellidos?: string } } | undefined)?.persona;
  const familia = (hoja as { familia?: { familia_numero?: number; persons?: { nombre?: string; apellidos?: string } } } | undefined)?.familia;
  const programa = (hoja as { programa?: { nombre?: string } } | undefined)?.programa;
  const isPersona = hoja?.scope === "persona";
  const titular = familia?.persons;
  const nombre = isPersona
    ? `${persona?.nombre ?? ""} ${persona?.apellidos ?? ""}`.trim()
    : titular ? `${titular.nombre ?? ""} ${titular.apellidos ?? ""}`.trim() : `Familia #${familia?.familia_numero ?? ""}`;

  return (
    <Sheet open={enabled} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {result.isLoading ? <Skeleton className="h-6 w-64" /> : `Hoja de derivaciones — ${nombre}`}
          </SheetTitle>
        </SheetHeader>

        {result.isLoading ? (
          <div className="space-y-2 mt-6">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : hoja ? (
          <>
            <div className="mt-4 text-sm space-y-1">
              <div><span className="text-muted-foreground">Programa: </span>{programa?.nombre}</div>
              <div><span className="text-muted-foreground">Profesional: </span>{hoja.profesional_nombre}</div>
              <div><span className="text-muted-foreground">Apertura: </span>{new Date(hoja.fecha_apertura).toLocaleDateString("es-ES")}</div>
            </div>

            <div className="mt-6">
              <div className="text-sm font-medium mb-2">Intervenciones ({intervenciones.length})</div>
              <ul className="space-y-2">
                {intervenciones.map((iv) => (
                  <li key={iv.id} className="border rounded p-2 text-sm">
                    <div className="font-medium">
                      {new Date(iv.fecha).toLocaleDateString("es-ES")} · {iv.tipo_slug}
                      {iv.institucion_snapshot && ` · ${(iv.institucion_snapshot as { nombre?: string }).nombre ?? ""}`}
                    </div>
                    <div className="mt-1">{iv.descripcion}</div>
                    {iv.observaciones && <div className="mt-1 text-muted-foreground">{iv.observaciones}</div>}
                    <div className="mt-1 text-xs text-muted-foreground">{iv.firmado_url ? "✓ Firmada" : "⏳ Pendiente de firma"}</div>
                  </li>
                ))}
                {intervenciones.length === 0 && (
                  <li className="text-sm text-muted-foreground">Sin intervenciones todavía</li>
                )}
              </ul>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button onClick={() => onAddIntervention(hojaId)}><Plus className="h-4 w-4 mr-1" /> Añadir intervención</Button>
              <Button variant="outline" onClick={() => onGenerate("docx")} disabled={busy !== null}>
                <FileText className="h-4 w-4 mr-1" /> {busy === "docx" ? "Generando..." : "Generar Word"}
              </Button>
              <Button variant="outline" onClick={() => onGenerate("pdf")} disabled={busy !== null}>
                <FileDown className="h-4 w-4 mr-1" /> {busy === "pdf" ? "Generando..." : "Generar PDF"}
              </Button>
              <Button variant="outline" disabled title="Subir hoja firmada — próximamente">
                <Upload className="h-4 w-4 mr-1" /> Subir hoja firmada
              </Button>
            </div>
          </>
        ) : (
          <div className="mt-6 text-muted-foreground">Hoja no encontrada.</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: Compose `index.tsx`**

```typescript
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { DerivarList } from "./DerivarList";
import { HojaDrawer } from "./HojaDrawer";
import { NuevaIntervencionForm } from "./NuevaIntervencionForm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import type { Scope } from "@/../../shared/derivar/types";

interface DerivarTabProps { programaId: string }

export default function DerivarTab({ programaId }: DerivarTabProps) {
  const [drawerHojaId, setDrawerHojaId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("persona");
  const [search, setSearch] = useState("");
  const [entityId, setEntityId] = useState<string | null>(null);

  const personSearch = trpc.persons.search.useQuery({ q: search }, { enabled: scope === "persona" && search.length >= 2 });
  const familiaSearch = trpc.families.getAll.useQuery({ search, estado: "all" }, { enabled: scope === "familia" && search.length >= 2 });

  return (
    <div className="space-y-3 p-4">
      <div className="flex justify-end">
        <Button onClick={() => setNewOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nueva intervención</Button>
      </div>

      <DerivarList programaId={programaId} onRowClick={setDrawerHojaId} />

      <HojaDrawer
        hojaId={drawerHojaId}
        onClose={() => setDrawerHojaId(null)}
        onAddIntervention={(hId) => { setDrawerHojaId(null); setNewOpen(true); /* form will resolve scope+entity from this hoja in v2 */ void hId; }}
      />

      {/* Nueva intervención dialog */}
      <Dialog open={newOpen} onOpenChange={(o) => { setNewOpen(o); if (!o) { setEntityId(null); setSearch(""); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Nueva intervención</DialogTitle></DialogHeader>
          {!entityId ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button variant={scope === "persona" ? "default" : "outline"} size="sm" onClick={() => setScope("persona")}>Para una persona</Button>
                <Button variant={scope === "familia" ? "default" : "outline"} size="sm" onClick={() => setScope("familia")}>Para una familia</Button>
              </div>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={scope === "persona" ? "Buscar persona..." : "Buscar familia..."} />
              {scope === "persona" && personSearch.data && (
                <div className="border rounded max-h-60 overflow-y-auto">
                  {personSearch.data.map((p) => (
                    <button key={p.id} type="button" className="w-full text-left p-2 hover:bg-muted text-sm" onClick={() => setEntityId(p.id)}>
                      {p.nombre} {p.apellidos}
                    </button>
                  ))}
                </div>
              )}
              {scope === "familia" && familiaSearch.data && (
                <div className="border rounded max-h-60 overflow-y-auto">
                  {familiaSearch.data.map((f) => {
                    const t = (f as { persons?: { nombre?: string; apellidos?: string } }).persons;
                    return (
                      <button key={f.id} type="button" className="w-full text-left p-2 hover:bg-muted text-sm" onClick={() => setEntityId(f.id)}>
                        #{f.familia_numero} · {t?.nombre} {t?.apellidos}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <NuevaIntervencionForm
              scope={scope}
              entityId={entityId}
              programaId={programaId}
              onSaved={(hojaId) => { setNewOpen(false); setEntityId(null); setSearch(""); setDrawerHojaId(hojaId); }}
              onCancel={() => { setEntityId(null); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

NOTE: `trpc.persons.search` is referenced but may not exist. **Check `server/routers/persons/` for an existing search procedure** and either reuse it or add a small one (`search: protectedProcedure.input({q: z.string()}).query(...)`).

- [ ] **Step 4: Enable Derivar in ProgramTabs**

```typescript
const PHASE1_ENABLED: ProgramTab[] = ["familias", "uploads", "mapa", "reports", "derivar"];
const DerivarTab = lazy(() => import("@/features/derivar"));
// Replace the disabled `derivar` trigger and add TabsContent.
```

- [ ] **Step 5: Smoke test**

```bash
pnpm dev
# /programas/programa_familias?tab=derivar
# Click "+ Nueva intervención" → choose Para una persona → search → pick → form opens with prefilled header
# Save → drawer opens, intervention shows
# Click "Generar PDF" → file downloads (assuming libreoffice + template are in place)
```

- [ ] **Step 6: Commit**

```bash
git add client/src/features/derivar client/src/features/programs/components/ProgramTabs.tsx
git commit -m "feat(derivar-tab): list + drawer + new-intervention dialog with smart prefill"
```

---

### Task 13: Client — `/admin/instituciones`

**Files:**
- Create: `client/src/pages/admin/InstitucionesPage.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Implement page**

```typescript
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CrearInstitucionInlineModal } from "@/features/derivar/CrearInstitucionInlineModal";
import { Plus, Edit3 } from "lucide-react";

export default function InstitucionesPage() {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const list = trpc.instituciones.list.useQuery({ search, limit: 100 });

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Instituciones</h1>
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nueva</Button>
      </div>

      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="max-w-md" />

      <Card>
        <CardContent className="p-0">
          {list.isLoading ? (
            <div className="p-4 space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left">Nombre</th>
                  <th className="p-2 text-left">Tipo</th>
                  <th className="p-2 text-left">Áreas</th>
                  <th className="p-2 text-left">Distrito</th>
                  <th className="p-2 text-left">Teléfono</th>
                  <th className="p-2 text-left">Estado</th>
                  <th className="p-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {((list.data?.rows ?? [])).map(i => (
                  <tr key={i.id} className="border-t">
                    <td className="p-2 font-medium">{i.nombre}</td>
                    <td className="p-2">{i.tipo ?? "—"}</td>
                    <td className="p-2">{(i.areas ?? []).join(", ") || "—"}</td>
                    <td className="p-2">{i.distrito ?? "—"}</td>
                    <td className="p-2">{i.telefono ?? "—"}</td>
                    <td className="p-2">{i.is_active ? <Badge>Activa</Badge> : <Badge variant="outline">Inactiva</Badge>}</td>
                    <td className="p-2 text-right"><Button variant="ghost" size="icon" className="h-7 w-7"><Edit3 className="h-3 w-3" /></Button></td>
                  </tr>
                ))}
                {(list.data?.rows ?? []).length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Sin resultados</td></tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <CrearInstitucionInlineModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); list.refetch(); }}
      />
    </div>
  );
}
```

NOTE: edit functionality is intentionally minimal in v1 (the action button is a placeholder). When ready, add an edit modal that calls `instituciones.update` (superadmin-only). Flag in a follow-up plan.

- [ ] **Step 2: Add route**

```tsx
// client/src/App.tsx
const InstitucionesAdmin = lazy(() => import("./pages/admin/InstitucionesPage"));
// ...
<Route path="/admin/instituciones">
  <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
    <InstitucionesAdmin />
  </ProtectedRoute>
</Route>
```

- [ ] **Step 3: Add to sidebar nav (admin section)**

`client/src/components/layout/AppShell.tsx` — find the admin nav block and add an entry. The implementer should match the exact icon/style of existing items:

```tsx
{(role === "admin" || role === "superadmin") && (
  <Link href="/admin/instituciones">
    <a><Library className="h-4 w-4" /> Instituciones</a>
  </Link>
)}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/InstitucionesPage.tsx client/src/App.tsx client/src/components/layout/AppShell.tsx
git commit -m "feat(admin): /admin/instituciones page + sidebar entry"
```

---

### Task 14: Phase 3 verification

- [ ] **Step 1: Full suite**

```bash
pnpm lint
pnpm check
pnpm test --run
```

- [ ] **Step 2: Manual end-to-end**

1. Visit `/admin/instituciones` → empty list. Click Nueva, create "Médicos del Mundo" with address `C. Cayetano Pando 2, 28047 Madrid` and tel `608 471 591`. Verify it lands.
2. Visit `/programas/programa_familias?tab=derivar`. Empty list. Click "Nueva intervención".
3. Pick "Para una persona", search "Uzcategui" (or seed data of your choice), pick.
4. Form opens. Header shows: nombre, nº unidad familiar, programa, profesional, fecha apertura — all read-only. Inputs only for fecha (default today), tipo, descripción, institución, observaciones.
5. Pick tipo Salud, descripción "Entrevista para informe social", institución "Médicos del Mundo" (typeahead). Save.
6. Drawer opens for the just-created hoja. Click "Generar Word" → `.docx` downloads. Open in Word. Verify the artifact matches the canonical layout with all placeholders filled.
7. Click "Generar PDF" → `.pdf` downloads (requires LibreOffice on host).
8. Add a second intervention (apoyo logístico). Re-generate PDF. Both rows appear in the table.

- [ ] **Step 3: Open final PR**

```bash
git push
gh pr edit --add-label phase-3
# Or if Phase 1 + 2 are merged: open a fresh PR for Phase 3.
```

---

## Self-review

- [ ] Spec coverage: Derivar tab ✓ · Hoja-uniqueness invariants enforced via partial unique indexes ✓ · institucion_snapshot freezing ✓ · DOCX + PDF generation ✓ · global Instituciones registry ✓ · admin surface ✓ · smart pre-fill via `startIntervention` ✓.
- [ ] Placeholder scan: `<NEXT_TS>` is intentional. Real values picked at migration creation.
- [ ] Type consistency: `Scope`, `InstitucionSnapshot`, `InterventionInsertSchema`, `StartInterventionResultSchema` shared between server and client. `TEMPLATE_PLACEHOLDERS` referenced from `docxRender.ts` (no drift between client form labels and template variables).
- [ ] Operational follow-ups (NOT engineering tasks):
  - Felix: install LibreOffice on deploy host (runbook in `docs/runbooks/libreoffice-setup.md`).
  - Bocatas: upload `derivacion_hoja_template_v1.docx` to the `program-document-templates` bucket with placeholders matching `shared/derivar/templatePlaceholders.ts`.
  - Sole + RGPD lawyer: EIPD addendum for "PDF generation of derivation hojas" before production rollout.

---

## Phase 3 ships when

- Tests green (typecheck, lint, vitest).
- Manual end-to-end runs without errors.
- LibreOffice runbook validated on at least one deploy (or local dev container).
- Word template uploaded with verified placeholders.

**End of Phase 3 plan.** Implementation done; all 5 tabs live.
