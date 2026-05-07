# Programa de Familia — 5-Tab Surface (Familias, Mapa, Reports, Uploads, Derivar)

> **Status:** APPROVED · 2026-05-06 · branch `feat/programa-familia-5-tab-surface`.
> **Implementation plans:** see `docs/superpowers/plans/2026-05-06-programa-familia-phase{1,2,3}.md`.

---

## Context

**Why this change is being made.** Today the Programa de Familia surface in `bocatas_digital` is a flat collection of 7 sibling pages (`/familias`, `/familias/:id`, `/familias/cumplimiento`, `/familias/entregas`, `/familias/verificar`, `/familias/informes-sociales`, `/familias/nueva`) that are reachable only via direct URL or by drilling into the generic `/programas/programa_familias` detail page. There is no dedicated, organized landing surface for the program; admins/social workers don't have a high-level "I am inside Programa de Familia, here are my four jobs" view. Reports today = `FamiliasInformesSociales.tsx` (a single date tracker). Uploads today = two modals buried inside flows. **Derivar does not exist** — no table, no router, no UI — yet the Bocatas team produces formal "Hoja de Registro de Derivaciones e Intervenciones" documents on paper today (real artifact: `260211 UZCATEGUI COLINA RAUL ALBERTO FAM 2422 DERIVACION MEDICOS DEL MUNDO.docx`).

**Intended outcome.** A coherent, top-benchmark surface for managing the Programa de Familia, structured as 5 tabs inside the existing program detail page, with a reusable pattern that other programs (Comedor, Cesta Básica) can adopt as they mature. Each tab does one job. The Derivar function is implemented as a **global, all-program** capability (any program's tab can mount it; the underlying tables and PDF generation are shared). A new `program_document_types` registry replaces today's hardcoded TS enum so each program owns its own document types.

**North-star user moments:**
- Sole opens `/programas/programa_familias` and instantly sees the 5 tabs. She knows where each job lives.
- She clicks "Familias", searches, opens a drawer, checks a padrón, closes it — back in the list — without losing filter state.
- She clicks "Mapa", sees Carabanchel is dark red on the Compliance layer, drills in, sees the 12 risky families, jumps to Familias pre-filtered.
- She clicks "Reports", picks "Resumen trimestral para financiadores", sets dates, exports. Or she builds a custom query "Familias en Carabanchel sin informe social en 60d" and saves it.
- She clicks "Uploads", drags 30 padrones, classifies them with type + familia in 5 minutes, done.
- She clicks "Derivar", picks "Nueva intervención", chooses Raúl Alberto (persona scope), tipo Salud, institución Médicos del Mundo, descripción, observaciones. Hits "Generar PDF". Prints. Signs. Re-uploads the signed PDF.

---

## Architecture

### Top-level routing change

`client/src/App.tsx` route table updates:

| Old route | New route | Notes |
|---|---|---|
| `/programas/:slug` | `/programas/:slug` (unchanged URL, page now renders 5 tabs when slug=`programa_familias`) | Other programs render their existing default content; tab strip is per-program-extensible |
| `/familias` | `/programas/programa_familias?tab=familias` | Old route 301-redirects to new for ~30 days, then removed |
| `/familias/cumplimiento` | `/programas/programa_familias?tab=familias&filter=cumplimiento` | Compliance becomes a saved-view inside Familias tab; the dashboard component is reused via `<ComplianceDashboard />` rendered in the saved view's "stats" sub-pane |
| `/familias/entregas` | stays at `/familias/entregas` | Out of scope — this is volunteer day-of-service flow, separate UX, not a tab |
| `/familias/verificar` | stays at `/familias/verificar` | Same — volunteer flow |
| `/familias/informes-sociales` | becomes a templated report card inside Reports tab | The existing `SocialReportPanel` is reused inside the templated report's drill-down |
| `/familias/nueva` | stays at `/familias/nueva` | Same — registration wizard |
| `/familias/:id` | stays at `/familias/:id` | Family detail page — used as the "deep work" target from the Familias drawer's "Abrir página completa" link |

### The 5-tab surface

```
/programas/programa_familias
├── ?tab=familias    (default) — list, search, saved views, drawer
├── ?tab=mapa        — choropleth by distrito, layer toggle (Densidad / Compliance)
├── ?tab=reports     — templated report library + custom query builder
├── ?tab=uploads     — bandeja: types catalog + bulk upload + archive explorer
└── ?tab=derivar     — derivaciones list + new intervention + hoja generation (PDF/DOCX)
```

Implementation: a `<ProgramTabs program={program}>` component lives at `client/src/features/programs/components/ProgramTabs.tsx`. It reads the program's `slug` and renders the appropriate tab set. For `programa_familias`, all 5 tabs are mounted. For other programs in v1, the tab strip is empty and `ProgramaDetalle.tsx` renders its existing content (no regression).

### Reusable pattern for other programs

Each tab component is decoupled from the slug:
- `<FamiliasTab programaId={id} />` — already program-scoped via `programa_id`
- `<MapaTab programaId={id} />` — program-scoped
- `<ReportsTab programaId={id} />` — program-scoped templates; the templates themselves declare which programs they apply to
- `<UploadsTab programaId={id} />` — program-scoped via `program_document_types.program_id`
- `<DerivarTab programaId={id} />` — program-scoped via `derivacion_hojas.programa_id`

When Comedor matures, the Comedor program's `ProgramTabs` wires the same components with its own `programaId`. Zero duplication.

---

## Tab 1 — Familias

**Job:** triage, search, drill-in. Clean and dense.

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Vistas: ⭐ Activas │ Atención requerida │ Sin GUF │ Sin informe │  saved views (segments)
│         │ + Nueva vista                                         │
├─────────────────────────────────────────────────────────────────┤
│ 🔍 Buscar nombre o número      [Filtros ▾]      [+ Nueva]      │
├─────────────────────────────────────────────────────────────────┤
│ Nº  │ Titular        │ Miembros │ Padrón     │ Informe   │ ⚠   │
│ 042 │ García López   │ 4        │ 2026-03-12 │ Al día    │     │
│ 043 │ Mansour Y.     │ 3        │ ⚠ Vencido  │ Pendiente │ 🔴  │  click → drawer
│ 044 │ Diallo M.      │ 2        │ 2026-04-01 │ Al día    │     │
│ ...                                                              │
└─────────────────────────────────────────────────────────────────┘
```

**Behaviors:**
- **Saved views** stored in a new `family_saved_views` table per user (`user_id`, `nombre`, `filters_json`, `is_shared`, `created_at`). Shared views (`is_shared=true`) appear for all admins.
- **Side drawer** (radix `Sheet`) opens on row click. Shows: family number, titular, members compact, last padrón date, last informe date, last delivery date, compliance badges (CM-1..CM-6), 3 action buttons: "Abrir página completa →" (deep link to existing `/familias/:id`), "Registrar entrega rápida", "Subir documento".
- **No KPIs** on the tab itself — those live on `/dashboard`.
- **URL state:** filter and saved-view selection are URL params so links are shareable.

**Server impact:** none. The existing `families.getAll` already supports filters; we extend the input schema to accept the saved-view filter set and add a new `families.savedViews` sub-router for CRUD.

---

## Tab 2 — Mapa

**Job:** aggregate spatial view for planning and compliance triage.

**Aggregation unit:** **Distrito** (21 Madrid distritos). A new column `families.distrito` is computed from a new column `families.codigo_postal` via a static lookup table `shared/madrid/postalCodeToDistrito.ts`.

**Layers (toggleable, mutually exclusive):**
- **Densidad** — color intensity = count of active families per distrito.
- **Compliance** — color intensity = % of active families in the distrito with one or more red CM-1..CM-6 flags.

**Interactivity:**
- Hover distrito → tooltip with metric value.
- Click distrito → side panel with stats + "Ver lista de familias en {distrito} →" button that navigates to `?tab=familias&distrito={slug}` with the distrito filter pre-applied.
- Layer toggle → instant recolor.
- Filters: estado (activas/todas), período (últimos 30d/90d/365d/todo).

**Library:** `react-leaflet` + OpenStreetMap tiles + Madrid distritos GeoJSON (public-domain, ~50KB, bundled or fetched once and cached). No Mapbox/Google = no API key, no PII to 3rd party, no recurring cost. RGPD-clean.

**Privacy:** No individual pins. Distritos with <3 active families are colored neutral with tooltip "<3 familias" — prevents single-family identifiability.

**Schema impact:**
```sql
ALTER TABLE families ADD COLUMN codigo_postal text;
ALTER TABLE families ADD COLUMN distrito text;
-- Trigger: on insert/update of codigo_postal, look up and set distrito.
CREATE OR REPLACE FUNCTION set_familia_distrito() RETURNS trigger AS $$
BEGIN
  -- Function body looks up distrito from a CTE-based static map; full SQL in plan.
  NEW.distrito := lookup_distrito(NEW.codigo_postal);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Backfill:** existing families have no `codigo_postal`. Migration leaves both columns NULL. UI for the map renders these as "Sin distrito asignado" (a separate grey region in a side panel below the map). A follow-up TODO for the team is to backfill via the next family touchpoint.

**Registration form change:** `RegistrationWizard` Step 3 (Contacto) gets a new `codigo_postal` field (5-digit numeric, optional v1 → required v2 once UX validated).

---

## Tab 3 — Reports

**Job:** ask, query, export.

**Two surfaces in one tab:**

### 3.1 Templated reports (cards)

A grid of pre-built reports grouped by section:

**Operational:** Familias atendidas por período · Padrón por vencer (próximos 30d) · Informes por renovar
**Compliance:** Compliance snapshot (CM-1..CM-6) · Familias en riesgo · Documentos faltantes
**Para financiadores:** Resumen trimestral · Distribución por distrito · Evolución histórica (últimos 12 meses)

Each card → modal with parameters → results table + chart → "Exportar CSV" / "Exportar PDF".

**Server pattern:** one tRPC procedure per report under `server/routers/reports/<report-name>.ts`, returning Zod-validated typed rows. Each procedure declares its parameter schema and result schema.

### 3.2 Custom query builder (Nuevo informe)

A guided 5-step builder backed by a Zod schema (the `SavedQuerySpec`):

1. **Entidad:** Familias / Personas / Miembros / Documentos / Entregas / Derivaciones (allowlist; each entity = a server-side projected view)
2. **Filtros:** add 0-N filter rows. Each row = `{ field, operator, value }`. Field list is per-entity allowlist; operator list is per-field-type allowlist (`eq, neq, gt, gte, lt, lte, in, contains, is_null, between`). Prevents arbitrary SQL.
3. **Group by:** 0 or 1 field from the entity's group-allowlist.
4. **Aggregación:** `count`, `sum`, `avg`, `min`, `max` (from the entity's aggregate-field-allowlist).
5. **Orden y límite:** order by + limit (cap 10000 rows hard).

Save with: `nombre`, `descripcion`, `is_shared`. Saved queries live in `report_saved_queries` (per-user, optionally shared) and appear as cards alongside templates.

**Execution path:** server receives the `SavedQuerySpec`, validates against the entity's allowlist, builds a parameterized Supabase query (no string concat, no `eval`), returns rows.

**Out of v1:** join across entities (only single-entity queries), nested aggregations, time-series charting in the builder (export-to-CSV is enough). Defer to v2.

**Schema:**
```sql
CREATE TABLE report_saved_queries (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  programa_id uuid REFERENCES programs(id),       -- nullable (global queries)
  nombre text NOT NULL,
  descripcion text,
  spec_json jsonb NOT NULL,                       -- Zod-validated SavedQuerySpec
  is_shared boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

---

## Tab 4 — Uploads

**Job:** upload, classify, find.

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Tipos de documento del Programa de Familia                       │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 📄 Padrón municipal  · Plantilla v3 ↓ · Guía ↓             │ │
│ │ 📄 Informe social    · Plantilla v2 ↓ · Guía ↓             │ │
│ │ 📄 Justificante      · (sin plantilla) · Guía ↓             │ │
│ │ ... (autorización recogida, documento identidad, etc.)       │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                            [+ Subir documento]  │
├─────────────────────────────────────────────────────────────────┤
│ Pendientes de clasificar (3)                                    │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐                             │
│ │ 📄 PDF  │ │ 📷 JPG  │ │ 📄 PDF  │  click → classify modal     │
│ └─────────┘ └─────────┘ └─────────┘                             │
├─────────────────────────────────────────────────────────────────┤
│ Archivo                                                          │
│ Filtros: [Familia] [Tipo] [Fecha] [Subido por] [Estado]         │
│                                                                  │
│ Familia │ Tipo         │ Subido     │ Vence     │ Acciones      │
│ 042     │ Padrón       │ 2026-04-12 │ 2026-10-12│ ··· 👁 ↓     │
│ 043     │ Informe soc. │ 2026-04-15 │ 2026-07-15│ ··· 👁 ↓     │
└─────────────────────────────────────────────────────────────────┘
```

**Big architectural change — DB-driven document types.**

Today: `shared/familyDocuments.ts` defines a hardcoded TS enum + a `FAMILY_DOC_TO_BOOLEAN_COLUMN` map. Every new doc type requires a code change.

New: `program_document_types` table is the source of truth.

```sql
CREATE TABLE program_document_types (
  id uuid PRIMARY KEY,
  programa_id uuid REFERENCES programs(id) NOT NULL,
  slug text NOT NULL,                            -- e.g. 'padron', 'informe_social'
  nombre text NOT NULL,
  descripcion text,
  scope text NOT NULL CHECK (scope IN ('familia','miembro')),
  template_url text,                             -- Supabase Storage path, nullable
  template_version text,
  template_filename text,
  guide_url text,
  guide_version text,
  guide_filename text,
  is_required boolean DEFAULT false,
  is_active boolean DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (programa_id, slug)
);
```

**Storage:** new bucket `program-document-templates`, RLS read-by-authenticated, write-by-superadmin. Templates and guides themselves are not PII (blank forms) — public-read inside the bucket once authenticated is fine.

**Backward-compat seed:** migration seeds `program_document_types` with the 7 existing hardcoded types for `programa_familias`: padron, justificante, informe_social, autorizacion_recogida, documento_identidad, consent_bocatas, consent_banco_alimentos. The boolean cache columns on `families` remain — a trigger keeps them in sync with documents inserted/deleted.

**Bulk upload flow:**
1. Click `[+ Subir documento]` → modal. Top of modal lists all active types with download links visible. User picks one type.
2. User picks familia (and miembro if scope=miembro) via typeahead.
3. User drops file(s). If multiple files dropped, they all inherit the same type and familia (or land in "Pendientes" if user picked "Clasificar después").
4. "Subir" → files go to Supabase Storage `family-documents` bucket; rows in `family_member_documents` and `family_documents` (existing tables, unchanged schema).

**Pendientes de clasificar:** new pseudo-state — files uploaded with `tipo_id=NULL`. Surface them in the bandeja for manual classification. (Implements the "drop a stack, classify later" workflow.)

**Admin surface:** `/admin/programas/:slug/tipos-documento` (superadmin only). Add/edit/deactivate types, upload new template/guide versions (versions are append-only — old versions stay accessible from history rows that referenced them).

**OCR auto-classification:** explicitly deferred to v2.

---

## Tab 5 — Derivar

**Job:** record interventions, generate the official Hoja, archive signed copies.

**Mental model — anchored in the real artifact** (`260211 UZCATEGUI COLINA RAUL ALBERTO FAM 2422 DERIVACION MEDICOS DEL MUNDO.docx`):

A **Hoja de Registro de Derivaciones e Intervenciones** is a per-(persona-or-familia, programa) document that accumulates rows over time. Each row is one intervention/derivation event. The hoja is printed and signed when a row is added; previous rows are re-printed and re-signed. The output artifact has fixed chrome (Bocatas logo, Comunidad de Madrid badge, RGPD footer addressed to bocatas@bocatas.io).

**Schema:**

```sql
-- Global institutions catalog (used by all programs)
CREATE TABLE instituciones (
  id uuid PRIMARY KEY,
  nombre text NOT NULL,
  tipo text CHECK (tipo IN ('publica','ong','parroquia','privada','otro')),
  areas text[] NOT NULL,                         -- ['salud','vivienda',...]
  direccion text,
  codigo_postal text,
  distrito text,                                 -- auto-set from codigo_postal via trigger
  telefono text,
  email text,
  notas text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tipos de intervención (DB-seeded, editable by superadmin)
CREATE TABLE tipos_intervencion (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  nombre text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true
);
-- Seed: salud, apoyo_logistico, vivienda, juridico, empleo, alimentacion,
--       infancia, salud_mental, formacion, otro

-- Header — one open hoja per (entity, programa)
CREATE TABLE derivacion_hojas (
  id uuid PRIMARY KEY,
  scope text NOT NULL CHECK (scope IN ('persona','familia')),
  persona_id uuid REFERENCES persons(id),
  familia_id uuid REFERENCES families(id),
  programa_id uuid REFERENCES programs(id) NOT NULL,
  profesional_id text NOT NULL,
  profesional_nombre text NOT NULL,              -- snapshotted at creation
  fecha_apertura date NOT NULL DEFAULT current_date,
  estado text NOT NULL CHECK (estado IN ('activa','cerrada')) DEFAULT 'activa',
  created_at timestamptz DEFAULT now(),
  CHECK (
    (scope = 'persona' AND persona_id IS NOT NULL) OR
    (scope = 'familia' AND familia_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX uq_hoja_persona_programa
  ON derivacion_hojas(persona_id, programa_id) WHERE scope='persona' AND estado='activa';
CREATE UNIQUE INDEX uq_hoja_familia_programa
  ON derivacion_hojas(familia_id, programa_id) WHERE scope='familia' AND estado='activa';

-- Rows — one per intervention. Append-only.
CREATE TABLE derivacion_intervenciones (
  id uuid PRIMARY KEY,
  hoja_id uuid REFERENCES derivacion_hojas(id) ON DELETE RESTRICT,
  fecha date NOT NULL,
  tipo_slug text NOT NULL REFERENCES tipos_intervencion(slug),
  descripcion text NOT NULL,
  institucion_id uuid REFERENCES instituciones(id),
  institucion_snapshot jsonb,                    -- frozen {nombre,direccion,telefono,email} at insert time
  observaciones text,
  firmado_url text,                              -- path to scanned signed PDF
  firmado_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

**The `institucion_snapshot` is critical:** if Médicos del Mundo changes its address tomorrow, yesterday's printed hoja keeps the old address. We freeze the institution payload at intervention-row insert.

**UX flow inside the Derivar tab:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Derivaciones — Programa de Familia                               │
│                                       [+ Nueva intervención]    │
├─────────────────────────────────────────────────────────────────┤
│ Filtros: [Tipo] [Institución] [Período] [Profesional]           │
│                                                                  │
│ Persona      │ Fam. │ Tipo     │ Institución   │ Fecha │ Hoja  │
│ Uzcategui R. │ 2422 │ Salud    │ Médicos M.    │ 02-11 │ 📄 PDF│
│ García L.    │ 0042 │ Vivienda │ Cáritas       │ 02-08 │ 📄 PDF│
│ ...                                                              │
└─────────────────────────────────────────────────────────────────┘

Click row → drawer with full hoja:
┌─────────────────────────────────────────────────────────────────┐
│ Hoja de derivaciones — Raúl Alberto Uzcategui Colina (FAM 2422) │
│ Programa: Programa de Familia · Profesional: Edgar D. Vargas    │
│ Apertura: 06/02/2026                                             │
├─────────────────────────────────────────────────────────────────┤
│ Intervenciones (1):                                              │
│  • 11/02/2026 · Salud · Médicos del Mundo                        │
│    "Entrevista para informe social..."                           │
│    Observaciones: "Se refiere a esta institución..."             │
│    Firma: ⏳ pendiente                                            │
│                                                                  │
│ [+ Añadir intervención]                                          │
│ [📄 Generar Word]  [📄 Generar PDF]  [↑ Subir hoja firmada]      │
└─────────────────────────────────────────────────────────────────┘
```

**+ Nueva intervención** flow:
1. Pick scope: `persona` or `familia`
2. Typeahead the persona or familia
3. Pick fecha (default today)
4. Pick tipo (dropdown from `tipos_intervencion`)
5. Descripción (textarea)
6. Pick institución (typeahead from `instituciones`, or `[+ Crear nueva institución]` inline modal — superadmin-only or staff-only)
7. Observaciones (textarea, optional)
8. Save → server upserts the open hoja for (entity, programa), inserts the intervention row with `institucion_snapshot`, returns hoja id.

**Generar Word / Generar PDF:**

Server endpoints `derivar.generateDocx` and `derivar.generatePdf`:
- Both fetch the hoja + ordered intervention rows + persona/familia data + program data.
- `docxtemplater` fills the canonical `.docx` template (stored in `program-document-templates` bucket as `derivacion_hoja_template_v1.docx`) with placeholders: `{nombre}`, `{nº_unidad_familiar}`, `{programa_referencia}`, `{profesional_referencia}`, `{fecha_apertura}`, `{intervenciones[]}` (table loop).
- For PDF: spawn `libreoffice --headless --convert-to pdf` on the generated `.docx` (server-side dependency — flagged for Felix to install in the deploy container).
- Return the file as a download.

**Subir hoja firmada:** drag-drop a scanned PDF → uploads to `family-documents` (existing bucket) under a `derivaciones/` prefix → updates `firmado_url` and `firmado_at` on the latest intervention row. (Future v2: per-row signature instead of per-hoja-latest.)

**Admin surface:** `/admin/instituciones` (superadmin) — CRUD on the global institutions catalog. Reused across all programs.

---

## Critical files to be created or modified

### Created — schema & seeds
- `supabase/migrations/<timestamp>_add_codigo_postal_distrito_to_families.sql`
- `supabase/migrations/<timestamp>_create_program_document_types.sql` + seed for programa_familias
- `supabase/migrations/<timestamp>_create_family_saved_views.sql`
- `supabase/migrations/<timestamp>_create_report_saved_queries.sql`
- `supabase/migrations/<timestamp>_create_instituciones.sql`
- `supabase/migrations/<timestamp>_create_tipos_intervencion.sql` + seed
- `supabase/migrations/<timestamp>_create_derivacion_hojas.sql`
- `supabase/migrations/<timestamp>_create_derivacion_intervenciones.sql`
- `supabase/migrations/<timestamp>_create_program_document_templates_bucket.sql`

### Created — shared
- `shared/madrid/postalCodeToDistrito.ts` — static map (~270 codes → 21 distritos)
- `shared/derivar/types.ts` — Zod for hoja, intervención, institución
- `shared/derivar/templatePlaceholders.ts` — placeholder name constants for `docxtemplater`
- `shared/reports/savedQuerySpec.ts` — Zod schema for the custom query builder + entity/field/operator allowlists

### Created — server
- `server/routers/derivar/index.ts`, `crud.ts`, `hojas.ts`, `intervenciones.ts`, `instituciones.ts`, `pdfGen.ts`
- `server/routers/reports/index.ts` + one file per templated report (≥9 procedures) + `customQuery.ts`
- `server/routers/familySavedViews.ts`
- `server/routers/programDocumentTypes.ts`
- `server/_core/docxRender.ts` — wraps `docxtemplater`
- `server/_core/pdfFromDocx.ts` — wraps `libreoffice --headless`
- (Reuse) `server/routers/families/{crud,documents,members,...}` extended where needed; **no rename or split**.

### Created — client features
- `client/src/features/programs/components/ProgramTabs.tsx` — the 5-tab strip
- `client/src/features/familias-tab/` — entire Familias tab (list, drawer, saved views)
- `client/src/features/mapa-tab/` — Mapa tab (react-leaflet, distrito GeoJSON, layer toggle)
- `client/src/features/reports-tab/` — templated cards + custom query builder
- `client/src/features/uploads-tab/` — bandeja + types catalog + bulk modal
- `client/src/features/derivar/` — Derivar tab (list, drawer, intervention form, PDF gen buttons, signed-upload)
- `client/src/pages/admin/InstitucionesPage.tsx`
- `client/src/pages/admin/ProgramaTiposDocumentoPage.tsx`

### Modified
- `client/src/App.tsx` — route table changes (table above)
- `client/src/pages/ProgramaDetalle.tsx` — render `<ProgramTabs />` when slug=programa_familias
- `client/src/components/layout/AppShell.tsx` — no nav change needed (we're inside `/programas`)
- `client/src/features/persons/components/RegistrationWizard/steps/Step3Contacto.tsx` — add `codigo_postal` field
- `shared/familyDocuments.ts` — deprecation comment, source of truth moves to `program_document_types` table
- `client/src/components/DocumentUploadModal.tsx` — read types from new server endpoint instead of TS enum

### Reused (no edit)
- `client/src/features/families/components/ComplianceDashboard.tsx`
- `client/src/features/families/components/SocialReportPanel.tsx`
- `client/src/components/DeliveryDocumentUpload.tsx`
- `server/routers/families/compliance.ts`

---

## Existing functions and utilities to reuse

| What | Where | Used by |
|---|---|---|
| `useFamilias`, `useFamilyMembers` | `client/src/features/families/hooks/useFamilias.ts` | Familias tab (list + drawer) |
| `redactHighRiskFields` | `server/_core/rlsRedaction.ts` | All tab procedures that surface familia rows |
| `slugFromName` | `client/src/features/programs/utils/slugFromName.ts` | Reports tab when generating report identifiers |
| `getComplianceStats` (CM-1..CM-6) | `server/routers/families/compliance.ts` | Compliance layer of Mapa tab + Compliance card of Reports |
| `families.getAll` | `server/routers/families/crud.ts` | Familias tab + Mapa tab data |
| `volunteerVisibility.ts` | `client/src/features/programs/utils/volunteerVisibility.ts` | All tabs (apply field-visibility filter) |
| `ProtectedRoute` | `client/src/components/layout/ProtectedRoute.tsx` | All new admin pages |
| Existing storage bucket `family-documents` | Supabase Storage | Uploads tab + Derivar signed-uploads |

---

## RGPD posture

- **No PII in URL params.** Tab state, filter state, and saved-view IDs only — never persona names or family numbers.
- **No PII to 3rd parties.** OpenStreetMap tiles serve only basemap geometry. No address geocoding via 3rd party APIs (postal-code → distrito is in-house).
- **Distrito aggregation prevents identifiability.** Distritos with <3 active families render neutral.
- **Institución address is snapshotted** at intervention time so historical hojas remain accurate even if the institution moves.
- **`createAdminClient()` only on server** — same pattern as existing routers. RLS policies still apply (per `ARCHITECTURE.md` C1 — service-role bypass is the runtime, but defense-in-depth lives in `redactHighRiskFields`).
- **EIPD update needed:** new processing activity = "PDF generation of derivation hojas". Flag in plan as a non-engineering blocker (Sole + RGPD lawyer signoff before production).

---

## Verification (how to test end-to-end)

### Local stack
1. `supabase start && supabase db reset` — applies all new migrations + seeds.
2. `supabase gen types typescript --local > client/src/lib/database.types.ts` — regenerates types.
3. `pnpm install && pnpm dev` — starts Vite + tRPC.
4. `docker exec` confirms libreoffice is reachable from the server container, OR run `which libreoffice` on the dev host (document either path in plan).

### Per-tab smoke
- **Familias:** open `/programas/programa_familias`, see 5 tabs, tab=familias is default. Search for an existing family by number. Click row, drawer opens, click "Abrir página completa →" lands on `/familias/:id`. Saved view "Activas" returns expected rows.
- **Mapa:** switch to Mapa tab. Verify Madrid GeoJSON renders. Click Carabanchel, side panel shows family count. Toggle to Compliance layer, recolor happens.
- **Reports:** click "Resumen trimestral", set dates, click Exportar CSV — file downloads. Click "Nuevo informe", build a query (Familias / filter estado=activa / group by distrito / count), save, re-run.
- **Uploads:** see types catalog at top with download links. Click "Subir documento", pick type Padrón, pick familia 042, drop a PDF. Verify it appears in archive list. Drop an unclassified PDF, verify it lands in "Pendientes".
- **Derivar:** click "+ Nueva intervención", pick scope=persona, pick Raúl Alberto, fill all fields, save. Open hoja drawer, click "Generar PDF", verify downloaded PDF visually matches the canonical template (logos, header, table, footer). Re-upload a scanned signed copy, verify `firmado_url` populates.

### Tests (per `~/.claude/rules/common/testing.md`)
- Unit: postal-code lookup, savedQuerySpec validation, institucion_snapshot freezing, hoja-uniqueness invariant.
- Integration: full Derivar flow (create hoja → add 2 interventions → generate Word → generate PDF) with a Supabase mock.
- E2E (Playwright, `E2E_LIVE=1`): one journey per tab — already-existing pattern in `e2e/family-*-spec.ts`.
- Coverage: maintain or beat the verified baseline (lines 25%, branches 70%, functions 40%, statements 25%) — per `docs/execution-2026-05-06.md` lock.

### Lighthouse
- New tabs are lazy-loaded (`React.lazy`) so initial bundle stays under the 300KB cap.
- `react-leaflet` and `docxtemplater` only ship in chunks for Mapa and Derivar respectively.

---

## Open items (for the implementation plan, not for v1 scope)

1. **EIPD addendum** for derivation PDF generation — non-engineering blocker.
2. **`libreoffice --headless` deploy infra** — Felix to confirm the deploy container has it, or add to Dockerfile.
3. **Postal-code backfill** for existing families — operational task for Sole, not a code change.
4. **Plantilla Word for Derivar** — Bocatas has the canonical `.docx`; needs to be uploaded to `program-document-templates` bucket as `derivacion_hoja_template_v1.docx` with placeholder syntax verified.
5. **Saved-view sharing UX** — v1 = is_shared bool. v2 = per-user share lists.
6. **Mapa: <3 families threshold** — verify with RGPD lawyer; the K-anonymity floor is project-policy not law.

---

**End of spec.** Implementation is split into 3 phase-plans under `docs/superpowers/plans/`:
1. `2026-05-06-programa-familia-phase1.md` — Foundations + Familias tab + Uploads tab
2. `2026-05-06-programa-familia-phase2.md` — Mapa tab + Reports tab
3. `2026-05-06-programa-familia-phase3.md` — Derivar tab + Instituciones + DOCX/PDF generation
