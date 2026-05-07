# Programa de Familia — Phase 2: Mapa Tab + Reports Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-06-programa-familia-5-tab-surface.md`

**Depends on:** Phase 1 (`docs/superpowers/plans/2026-05-06-programa-familia-phase1.md`) — `<ProgramTabs />` and `program_document_types` registry are required.

**Goal:** Light up the Mapa and Reports tabs.
- **Mapa:** aggregate choropleth of Madrid by distrito with Densidad and Compliance layers, click-to-drill into Familias filtered by distrito.
- **Reports:** templated report library (≥9 cards) + custom query builder ("Nuevo informe") with allowlisted entities/fields/operators, saved-query persistence.

**Architecture:** A small `shared/madrid/postalCodeToDistrito.ts` static map underpins the Mapa tab — distrito column on `families` is derived deterministically from `codigo_postal`. The Mapa tab uses `react-leaflet` + OpenStreetMap tiles + a public-domain Madrid distritos GeoJSON. The Reports tab introduces a `SavedQuerySpec` Zod schema with allowlists per entity to prevent arbitrary SQL; the executor is a Supabase query builder, never string concatenation.

**Tech Stack additions vs Phase 1:** `react-leaflet` + `leaflet`, Madrid distritos GeoJSON file (~50KB committed under `client/src/assets/`).

**Phase 2 ships:**
- Mapa tab (Densidad + Compliance layers, distrito drill-in)
- `families.codigo_postal` + `families.distrito` columns + trigger
- `RegistrationWizard` Step3 codigo_postal field on FamiliaRegistro
- Reports tab with 9 templated reports + custom query builder
- `report_saved_queries` table

**Phase 2 does NOT ship:** Derivar (Phase 3).

**Conventions** (see Phase 1 for full list): `<NEXT_TS>` = a concrete `YYYYMMDDhhmmss` value picked at migration creation time. `<NEXT_TS+1>` etc. are subsequent monotonic timestamps within this phase. `migrate-filenames` CI validates ordering.

---

## File Structure

### Created — schema
- `supabase/migrations/<NEXT_TS>_add_codigo_postal_distrito_to_families.sql`
- `supabase/migrations/<NEXT_TS+1>_add_codigo_postal_distrito_to_persons.sql` (smaller — used only by Reports allowlist for personas filter)
- `supabase/migrations/<NEXT_TS+2>_create_report_saved_queries.sql`

### Created — shared
- `shared/madrid/postalCodeToDistrito.ts` — static map; ~270 codes → 21 distritos
- `shared/madrid/distritos.ts` — distrito slugs + display names
- `shared/reports/savedQuerySpec.ts` — Zod schema + entity/field/operator allowlists
- `shared/reports/entities.ts` — allowlist tables for Familias / Personas / Miembros / Documentos / Entregas

### Created — server
- `server/routers/reports/index.ts` (compose templated + custom)
- `server/routers/reports/templated/familiasAtendidas.ts`
- `server/routers/reports/templated/padronPorVencer.ts`
- `server/routers/reports/templated/informesPorRenovar.ts`
- `server/routers/reports/templated/complianceSnapshot.ts`
- `server/routers/reports/templated/familiasEnRiesgo.ts`
- `server/routers/reports/templated/documentosFaltantes.ts`
- `server/routers/reports/templated/resumenTrimestral.ts`
- `server/routers/reports/templated/distribucionPorDistrito.ts`
- `server/routers/reports/templated/evolucionHistorica.ts`
- `server/routers/reports/customQuery.ts` — execute + save + list
- `server/routers/mapa.ts` — aggregate query for distrito heatmap data

### Created — client
- `client/src/features/mapa-tab/index.tsx`
- `client/src/features/mapa-tab/MapaChoropleth.tsx`
- `client/src/features/mapa-tab/LayerToggle.tsx`
- `client/src/features/mapa-tab/DistritoPanel.tsx`
- `client/src/features/mapa-tab/hooks/useMapaData.ts`
- `client/src/assets/madrid-distritos.geojson`
- `client/src/features/reports-tab/index.tsx`
- `client/src/features/reports-tab/TemplatesGrid.tsx`
- `client/src/features/reports-tab/templates/<one file per template>.tsx` (9 files)
- `client/src/features/reports-tab/CustomQueryBuilder.tsx`
- `client/src/features/reports-tab/SavedQueriesList.tsx`
- `client/src/features/reports-tab/hooks/useSavedQueries.ts`
- `client/src/features/reports-tab/utils/exportCsv.ts`

### Modified
- `supabase/migrations/...` — none beyond the three new ones
- `client/src/features/persons/components/RegistrationWizard/steps/Step3Contacto.tsx` — add `codigo_postal` field
- `client/src/features/persons/schemas/personCreate.ts` — add `codigo_postal: z.string().regex(/^\d{5}$/).optional()`
- `client/src/pages/FamiliaRegistro.tsx` — add `codigo_postal` capture (separate from titular's persona) — confirm whether this page captures family-level data or relies on titular only; update accordingly
- `client/src/features/programs/components/ProgramTabs.tsx` — flip `mapa` and `reports` to enabled
- `server/routers/families/crud.ts` — accept `codigo_postal` in the `create` input

### Reused (no edit)
- `server/routers/families/compliance.ts` — `getComplianceStats` reused inside `complianceSnapshot` template + the Mapa Compliance layer
- `server/routers/dashboard.ts` (if present, for time-series scaffolding)
- `client/src/components/ui/select`, `dialog`, `card`, `button` — shadcn primitives
- shared `redactHighRiskFields` for any Reports row that surfaces persons/families

---

## Tasks

### Task 1: Static map — postal code → distrito

**Files:**
- Create: `shared/madrid/distritos.ts`
- Create: `shared/madrid/postalCodeToDistrito.ts`
- Test: `shared/madrid/__tests__/postalCodeToDistrito.test.ts`

- [ ] **Step 1: Write the distritos enum**

`shared/madrid/distritos.ts`:

```typescript
export const MADRID_DISTRITOS = [
  { slug: "centro", nombre: "Centro" },
  { slug: "arganzuela", nombre: "Arganzuela" },
  { slug: "retiro", nombre: "Retiro" },
  { slug: "salamanca", nombre: "Salamanca" },
  { slug: "chamartin", nombre: "Chamartín" },
  { slug: "tetuan", nombre: "Tetuán" },
  { slug: "chamberi", nombre: "Chamberí" },
  { slug: "fuencarral_el_pardo", nombre: "Fuencarral-El Pardo" },
  { slug: "moncloa_aravaca", nombre: "Moncloa-Aravaca" },
  { slug: "latina", nombre: "Latina" },
  { slug: "carabanchel", nombre: "Carabanchel" },
  { slug: "usera", nombre: "Usera" },
  { slug: "puente_de_vallecas", nombre: "Puente de Vallecas" },
  { slug: "moratalaz", nombre: "Moratalaz" },
  { slug: "ciudad_lineal", nombre: "Ciudad Lineal" },
  { slug: "hortaleza", nombre: "Hortaleza" },
  { slug: "villaverde", nombre: "Villaverde" },
  { slug: "villa_de_vallecas", nombre: "Villa de Vallecas" },
  { slug: "vicalvaro", nombre: "Vicálvaro" },
  { slug: "san_blas_canillejas", nombre: "San Blas-Canillejas" },
  { slug: "barajas", nombre: "Barajas" },
] as const;

export type DistritoSlug = (typeof MADRID_DISTRITOS)[number]["slug"];
export const DISTRITO_SLUGS: readonly DistritoSlug[] = MADRID_DISTRITOS.map(d => d.slug);
```

- [ ] **Step 2: Write the postal-code → distrito map**

`shared/madrid/postalCodeToDistrito.ts` — public-domain Madrid postal-code mapping. Use the canonical list from the Ayuntamiento de Madrid (verifiable). Sample fragment (full file ~270 entries):

```typescript
import type { DistritoSlug } from "./distritos";

/**
 * Maps Madrid 5-digit postal codes to a distrito slug.
 * Source: Ayuntamiento de Madrid open data (postal-code-by-distrito).
 * Some postal codes span 2 distritos; we choose the predominant one.
 */
export const POSTAL_CODE_TO_DISTRITO: Readonly<Record<string, DistritoSlug>> = Object.freeze({
  // Centro (28012, 28013, 28004, 28005, 28014)
  "28012": "centro",
  "28013": "centro",
  "28004": "centro",
  "28005": "centro",
  "28014": "centro",
  // Arganzuela (28005, 28045, 28019, 28007 — overlap with Centro/Retiro picks predominant)
  "28045": "arganzuela",
  // Retiro
  "28007": "retiro",
  "28009": "retiro",
  // Salamanca
  "28001": "salamanca",
  "28006": "salamanca",
  "28002": "salamanca",
  "28028": "salamanca",
  // Chamartín
  "28036": "chamartin",
  "28046": "chamartin",
  "28033": "chamartin",
  // Tetuán
  "28039": "tetuan",
  "28020": "tetuan",
  // Chamberí
  "28010": "chamberi",
  "28015": "chamberi",
  // Fuencarral-El Pardo
  "28034": "fuencarral_el_pardo",
  "28035": "fuencarral_el_pardo",
  "28049": "fuencarral_el_pardo",
  "28048": "fuencarral_el_pardo",
  "28050": "fuencarral_el_pardo",
  "28055": "fuencarral_el_pardo",
  // Moncloa-Aravaca
  "28008": "moncloa_aravaca",
  "28023": "moncloa_aravaca",
  "28040": "moncloa_aravaca",
  // Latina
  "28011": "latina",
  "28024": "latina",
  "28044": "latina",
  "28047": "latina",
  // Carabanchel
  "28019": "carabanchel",
  "28025": "carabanchel",
  // Usera
  "28026": "usera",
  // Puente de Vallecas
  "28038": "puente_de_vallecas",
  // Moratalaz
  "28030": "moratalaz",
  // Ciudad Lineal
  "28017": "ciudad_lineal",
  "28027": "ciudad_lineal",
  "28037": "ciudad_lineal",
  // Hortaleza
  "28042": "hortaleza",
  "28043": "hortaleza",
  "28033": "hortaleza",
  "28055": "hortaleza",
  // Villaverde
  "28021": "villaverde",
  "28041": "villaverde",
  // Villa de Vallecas
  "28031": "villa_de_vallecas",
  "28051": "villa_de_vallecas",
  // Vicálvaro
  "28032": "vicalvaro",
  // San Blas-Canillejas
  "28022": "san_blas_canillejas",
  "28037": "san_blas_canillejas",
  // Barajas
  "28042": "barajas",
});

export function lookupDistrito(codigoPostal: string | null | undefined): DistritoSlug | null {
  if (!codigoPostal) return null;
  const normalized = codigoPostal.trim();
  if (!/^\d{5}$/.test(normalized)) return null;
  return POSTAL_CODE_TO_DISTRITO[normalized] ?? null;
}
```

NOTE for the implementer: the sample above contains intentional duplicate keys (e.g. `28019` appears under both Centro and Carabanchel) which TypeScript will collapse to the last value. **Before committing, replace this sample with the actual full list.** Source: https://datos.madrid.es (Ayuntamiento open data) or https://www.codigopostal.es. Verify against a recent open-data export. Total entries: ~270. The seed below is illustrative only; the real one needs human review.

- [ ] **Step 3: Test**

`shared/madrid/__tests__/postalCodeToDistrito.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { lookupDistrito, POSTAL_CODE_TO_DISTRITO } from "../postalCodeToDistrito";
import { DISTRITO_SLUGS } from "../distritos";

describe("lookupDistrito", () => {
  it("returns null for empty input", () => {
    expect(lookupDistrito("")).toBeNull();
    expect(lookupDistrito(null)).toBeNull();
    expect(lookupDistrito(undefined)).toBeNull();
  });

  it("returns null for non-5-digit input", () => {
    expect(lookupDistrito("1234")).toBeNull();
    expect(lookupDistrito("123456")).toBeNull();
    expect(lookupDistrito("ABCDE")).toBeNull();
  });

  it("trims whitespace", () => {
    const sample = Object.keys(POSTAL_CODE_TO_DISTRITO)[0];
    expect(lookupDistrito(`  ${sample}  `)).toBe(POSTAL_CODE_TO_DISTRITO[sample]);
  });

  it("returns null for non-Madrid codes", () => {
    expect(lookupDistrito("08001")).toBeNull(); // Barcelona
  });

  it("every mapped value is a valid distrito slug", () => {
    for (const slug of Object.values(POSTAL_CODE_TO_DISTRITO)) {
      expect(DISTRITO_SLUGS).toContain(slug);
    }
  });
});
```

```bash
pnpm test --run shared/madrid/__tests__/postalCodeToDistrito.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add shared/madrid/
git commit -m "feat(shared): add Madrid postal-code → distrito static lookup table"
```

---

### Task 2: Schema — `families.codigo_postal` + `families.distrito` + trigger

**Files:**
- Create: `supabase/migrations/<NEXT_TS>_add_codigo_postal_distrito_to_families.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add postal-code + distrito columns to families. distrito is auto-derived
-- from codigo_postal via a trigger that uses an in-DB CTE map mirroring
-- shared/madrid/postalCodeToDistrito.ts. Backfill leaves both NULL for
-- existing rows (operational backfill task for the team, per spec).

ALTER TABLE families
  ADD COLUMN IF NOT EXISTS codigo_postal text,
  ADD COLUMN IF NOT EXISTS distrito text;

-- Helper function: maps a postal code to a distrito slug.
-- The CASE list MUST mirror shared/madrid/postalCodeToDistrito.ts.
-- A small drift-detection test (Task 3) keeps both in sync.
CREATE OR REPLACE FUNCTION madrid_distrito_for(cp text) RETURNS text AS $$
BEGIN
  IF cp IS NULL OR cp !~ '^\d{5}$' THEN RETURN NULL; END IF;
  RETURN CASE cp
    WHEN '28012' THEN 'centro'
    WHEN '28013' THEN 'centro'
    WHEN '28004' THEN 'centro'
    WHEN '28005' THEN 'centro'
    WHEN '28014' THEN 'centro'
    WHEN '28045' THEN 'arganzuela'
    WHEN '28007' THEN 'retiro'
    WHEN '28009' THEN 'retiro'
    WHEN '28001' THEN 'salamanca'
    WHEN '28006' THEN 'salamanca'
    WHEN '28002' THEN 'salamanca'
    WHEN '28028' THEN 'salamanca'
    WHEN '28036' THEN 'chamartin'
    WHEN '28046' THEN 'chamartin'
    WHEN '28033' THEN 'chamartin'
    WHEN '28039' THEN 'tetuan'
    WHEN '28020' THEN 'tetuan'
    WHEN '28010' THEN 'chamberi'
    WHEN '28015' THEN 'chamberi'
    WHEN '28034' THEN 'fuencarral_el_pardo'
    WHEN '28035' THEN 'fuencarral_el_pardo'
    WHEN '28049' THEN 'fuencarral_el_pardo'
    WHEN '28048' THEN 'fuencarral_el_pardo'
    WHEN '28050' THEN 'fuencarral_el_pardo'
    WHEN '28008' THEN 'moncloa_aravaca'
    WHEN '28023' THEN 'moncloa_aravaca'
    WHEN '28040' THEN 'moncloa_aravaca'
    WHEN '28011' THEN 'latina'
    WHEN '28024' THEN 'latina'
    WHEN '28044' THEN 'latina'
    WHEN '28047' THEN 'latina'
    WHEN '28019' THEN 'carabanchel'
    WHEN '28025' THEN 'carabanchel'
    WHEN '28026' THEN 'usera'
    WHEN '28038' THEN 'puente_de_vallecas'
    WHEN '28030' THEN 'moratalaz'
    WHEN '28017' THEN 'ciudad_lineal'
    WHEN '28027' THEN 'ciudad_lineal'
    WHEN '28037' THEN 'ciudad_lineal'
    WHEN '28042' THEN 'hortaleza'
    WHEN '28043' THEN 'hortaleza'
    WHEN '28021' THEN 'villaverde'
    WHEN '28041' THEN 'villaverde'
    WHEN '28031' THEN 'villa_de_vallecas'
    WHEN '28051' THEN 'villa_de_vallecas'
    WHEN '28032' THEN 'vicalvaro'
    WHEN '28022' THEN 'san_blas_canillejas'
    ELSE NULL
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger: keep families.distrito in sync with codigo_postal.
CREATE OR REPLACE FUNCTION families_set_distrito() RETURNS trigger AS $$
BEGIN
  NEW.distrito := madrid_distrito_for(NEW.codigo_postal);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER families_distrito_sync
  BEFORE INSERT OR UPDATE OF codigo_postal ON families
  FOR EACH ROW EXECUTE FUNCTION families_set_distrito();

CREATE INDEX IF NOT EXISTS families_distrito_idx ON families(distrito) WHERE distrito IS NOT NULL;
```

NOTE for implementer: replace the sample CASE list with the full ~270-entry list, byte-equal to `shared/madrid/postalCodeToDistrito.ts`. The drift test (Task 3) will fail if they diverge.

- [ ] **Step 2: Apply locally + regen types**

```bash
supabase db reset
supabase gen types typescript --local > client/src/lib/database.types.ts
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/<NEXT_TS>_add_codigo_postal_distrito_to_families.sql client/src/lib/database.types.ts
git commit -m "feat(schema): add families.codigo_postal + distrito with auto-sync trigger"
```

---

### Task 3: Drift detection — TS map ↔ SQL function

**Files:**
- Test: `server/__tests__/madrid-distrito-drift.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect } from "vitest";
import { POSTAL_CODE_TO_DISTRITO } from "../../shared/madrid/postalCodeToDistrito";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Madrid distrito mapping drift detection", () => {
  it("every TS-mapped postal code appears in the SQL function", () => {
    const migrationsDir = resolve(__dirname, "..", "..", "supabase", "migrations");
    const sqlFile = readFileSync(
      resolve(migrationsDir, "..").replace("server", ""),
      "utf-8",
    ).toString();
    // Read all migration files and find the one defining madrid_distrito_for.
    // Implementer: glob over supabase/migrations/*.sql, find file containing
    // 'CREATE OR REPLACE FUNCTION madrid_distrito_for', and assert that
    // every TS key appears as 'WHEN '<code>'' in it.
    expect(true).toBe(true); // stub — Implementer fills this in.
  });
});
```

NOTE: this test is currently a stub. The full implementation reads the migration file at `supabase/migrations/<NEXT_TS>_add_codigo_postal_distrito_to_families.sql`, extracts every `WHEN 'XXXXX'` clause, and asserts equality with `Object.keys(POSTAL_CODE_TO_DISTRITO)`. Concretely:

```typescript
import { describe, it, expect } from "vitest";
import { POSTAL_CODE_TO_DISTRITO } from "../../shared/madrid/postalCodeToDistrito";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Madrid distrito mapping drift detection", () => {
  it("TS map and SQL function reference the same postal codes", () => {
    const dir = resolve(__dirname, "../../supabase/migrations");
    const file = readdirSync(dir).find(f => f.includes("codigo_postal_distrito"));
    expect(file).toBeDefined();
    const sql = readFileSync(resolve(dir, file!), "utf-8");
    const sqlCodes = Array.from(sql.matchAll(/WHEN '(\d{5})'/g)).map(m => m[1]).sort();
    const tsCodes = Object.keys(POSTAL_CODE_TO_DISTRITO).sort();
    expect(sqlCodes).toEqual(tsCodes);
  });
});
```

- [ ] **Step 2: Run, expect PASS (or FAIL if maps diverge — fix maps until they match)**

```bash
pnpm test --run server/__tests__/madrid-distrito-drift.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add server/__tests__/madrid-distrito-drift.test.ts
git commit -m "test: drift guard for Madrid postal-code map between TS and SQL"
```

---

### Task 4: Persons schema mirror (`persons.codigo_postal` + `persons.distrito`)

**Files:**
- Create: `supabase/migrations/<NEXT_TS+1>_add_codigo_postal_distrito_to_persons.sql`

- [ ] **Step 1: Migration**

```sql
ALTER TABLE persons
  ADD COLUMN IF NOT EXISTS codigo_postal text,
  ADD COLUMN IF NOT EXISTS distrito text;

CREATE OR REPLACE FUNCTION persons_set_distrito() RETURNS trigger AS $$
BEGIN
  NEW.distrito := madrid_distrito_for(NEW.codigo_postal);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER persons_distrito_sync
  BEFORE INSERT OR UPDATE OF codigo_postal ON persons
  FOR EACH ROW EXECUTE FUNCTION persons_set_distrito();

CREATE INDEX IF NOT EXISTS persons_distrito_idx ON persons(distrito) WHERE distrito IS NOT NULL;
```

- [ ] **Step 2: Apply + regen types**

```bash
supabase db reset
supabase gen types typescript --local > client/src/lib/database.types.ts
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/<NEXT_TS+1>_add_codigo_postal_distrito_to_persons.sql client/src/lib/database.types.ts
git commit -m "feat(schema): mirror codigo_postal + distrito columns on persons"
```

---

### Task 5: RegistrationWizard — capture `codigo_postal`

**Files:**
- Modify: `client/src/features/persons/components/RegistrationWizard/steps/Step3Contacto.tsx`
- Modify: `client/src/features/persons/schemas/personCreate.ts`
- Test: `client/src/features/persons/__tests__/Step3Contacto.codigoPostal.test.tsx`

- [ ] **Step 1: Add to the schema**

Read `client/src/features/persons/schemas/personCreate.ts`, then add:

```typescript
codigo_postal: z.string().regex(/^\d{5}$/, "Debe ser un código postal de 5 dígitos").optional(),
```

- [ ] **Step 2: Update Step3Contacto.tsx**

Add a new field below `direccion`:

```tsx
<div className="grid grid-cols-2 gap-3">
  <div className="space-y-1">
    <Label htmlFor="codigo_postal">Código postal</Label>
    <Input id="codigo_postal" inputMode="numeric" maxLength={5} {...register("codigo_postal")} placeholder="28047" />
    <FieldError message={errors.codigo_postal?.message} />
  </div>
  <div className="space-y-1">
    <Label htmlFor="municipio">Municipio</Label>
    <Input id="municipio" {...register("municipio")} placeholder="Madrid" />
  </div>
</div>
```

(Move the existing `municipio` next to it; delete the standalone block.)

- [ ] **Step 3: Test**

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { Step3Contacto } from "../components/RegistrationWizard/steps/Step3Contacto";

function Wrap() {
  const form = useForm();
  return <Step3Contacto register={form.register} errors={form.formState.errors} />;
}

describe("Step3Contacto codigo_postal", () => {
  it("renders codigo_postal input", () => {
    render(<Wrap />);
    expect(screen.getByLabelText(/código postal/i)).toBeInTheDocument();
  });

  it("accepts 5-digit input", async () => {
    render(<Wrap />);
    const input = screen.getByLabelText(/código postal/i);
    await userEvent.type(input, "28047");
    expect((input as HTMLInputElement).value).toBe("28047");
  });
});
```

- [ ] **Step 4: Run, expect PASS, commit**

```bash
pnpm test --run client/src/features/persons/__tests__/Step3Contacto.codigoPostal.test.tsx
git add client/src/features/persons
git commit -m "feat(persons): capture codigo_postal in registration Step3 (Contacto)"
```

---

### Task 6: Madrid distritos GeoJSON — bundle the asset

**Files:**
- Create: `client/src/assets/madrid-distritos.geojson` (downloaded from public open-data)

- [ ] **Step 1: Download Madrid distritos GeoJSON**

Public-domain GeoJSON for Madrid's 21 distritos. Source: https://datos.madrid.es or https://github.com/martgnz/madrid-geojson. Verify license. Approximate file size: 50-150KB.

```bash
curl -L -o client/src/assets/madrid-distritos.geojson \
  https://raw.githubusercontent.com/martgnz/madrid-geojson/master/distritos.geojson
```

(If the source URL is dead, use any of: martgnz/madrid-geojson · Ayuntamiento open-data CKAN · OpenStreetMap export. Always verify license is public-domain or CC0/CC-BY.)

- [ ] **Step 2: Validate it has 21 distritos**

```bash
jq '.features | length' client/src/assets/madrid-distritos.geojson
# Expected: 21
```

- [ ] **Step 3: Commit**

```bash
git add client/src/assets/madrid-distritos.geojson
git commit -m "chore(assets): bundle Madrid distritos GeoJSON for the Mapa tab"
```

---

### Task 7: Server router — `mapa.ts` (aggregate by distrito)

**Files:**
- Create: `server/routers/mapa.ts`
- Test: `server/routers/__tests__/mapa.test.ts`
- Modify: `server/_core/trpc.ts` (wire `mapaRouter` into `appRouter`)

- [ ] **Step 1: Implement `mapa.ts`**

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../_core/trpc";
import { createAdminClient } from "../../client/src/lib/supabase/server";
import { DISTRITO_SLUGS, type DistritoSlug } from "../../shared/madrid/distritos";

const FiltersSchema = z.object({
  estado: z.enum(["activa", "all"]).default("activa"),
  periodoDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.literal(0)]).default(0),
});

interface DensidadRow { distrito: DistritoSlug | "sin_asignar"; total: number }
interface ComplianceRow { distrito: DistritoSlug | "sin_asignar"; total: number; conRiesgo: number }

export const mapaRouter = router({
  /** Densidad: count of families per distrito (filtered). */
  densidad: adminProcedure
    .input(FiltersSchema)
    .query(async ({ input }): Promise<DensidadRow[]> => {
      const db = createAdminClient();
      let q = db.from("families").select("distrito").is("deleted_at", null);
      if (input.estado === "activa") q = q.eq("estado", "activa");
      if (input.periodoDays > 0) {
        const since = new Date(Date.now() - input.periodoDays * 24 * 60 * 60 * 1000).toISOString();
        q = q.gte("created_at", since);
      }
      const { data, error } = await q;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        const key = (row.distrito ?? "sin_asignar") as string;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return Array.from(counts.entries()).map(([distrito, total]) => ({ distrito: distrito as DistritoSlug | "sin_asignar", total }));
    }),

  /** Compliance: count of families with one or more red CM-1..CM-6 flags per distrito. */
  compliance: adminProcedure
    .input(FiltersSchema)
    .query(async ({ input }): Promise<ComplianceRow[]> => {
      const db = createAdminClient();
      // Pull families with the booleans we need; the per-row CM check is in JS to avoid
      // polluting the SQL with the compliance domain logic (which lives in compliance.ts).
      let q = db
        .from("families")
        .select("distrito, alta_en_guf, padron_recibido, padron_recibido_fecha, informe_social, informe_social_fecha, consent_bocatas, consent_banco_alimentos, docs_identidad, deleted_at, estado")
        .is("deleted_at", null);
      if (input.estado === "activa") q = q.eq("estado", "activa");
      if (input.periodoDays > 0) {
        const since = new Date(Date.now() - input.periodoDays * 24 * 60 * 60 * 1000).toISOString();
        q = q.gte("created_at", since);
      }
      const { data, error } = await q;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      const map = new Map<string, { total: number; conRiesgo: number }>();
      for (const row of data ?? []) {
        const key = (row.distrito ?? "sin_asignar") as string;
        const entry = map.get(key) ?? { total: 0, conRiesgo: 0 };
        entry.total += 1;
        const hasRedFlag =
          !row.alta_en_guf ||
          !row.padron_recibido ||
          !row.informe_social ||
          !row.consent_bocatas ||
          !row.consent_banco_alimentos ||
          !row.docs_identidad;
        if (hasRedFlag) entry.conRiesgo += 1;
        map.set(key, entry);
      }
      return Array.from(map.entries()).map(([distrito, v]) => ({ distrito: distrito as DistritoSlug | "sin_asignar", ...v }));
    }),

  /** Drilldown: family list for a given distrito (passes through to families.getAll). */
  familiasInDistrito: adminProcedure
    .input(z.object({
      distrito: z.enum([...DISTRITO_SLUGS] as [string, ...string[]]).or(z.literal("sin_asignar")),
    }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      let q = db.from("families")
        .select("id, familia_numero, estado, persons!titular_id(nombre, apellidos)")
        .is("deleted_at", null)
        .eq("estado", "activa");
      if (input.distrito === "sin_asignar") {
        q = q.is("distrito", null);
      } else {
        q = q.eq("distrito", input.distrito);
      }
      const { data, error } = await q.limit(500);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),
});
```

- [ ] **Step 2: Test (basic shape + role guard)**

```typescript
import { describe, it, expect, vi } from "vitest";
import { mapaRouter } from "../mapa";
import type { Context } from "../../_core/context";

describe("mapa router", () => {
  it("rejects voluntario from densidad", async () => {
    const ctx = { user: { id: "u", role: "voluntario", openId: "u" }, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, correlationId: "t" } as Context;
    const caller = mapaRouter.createCaller(ctx);
    await expect(caller.densidad({})).rejects.toThrow(/UNAUTHORIZED|FORBIDDEN/);
  });
});
```

- [ ] **Step 3: Wire + commit**

```bash
# in server/_core/trpc.ts:
# import { mapaRouter } from "../routers/mapa"; appRouter.mapa = mapaRouter
pnpm test --run server/routers/__tests__/mapa.test.ts
git add server/routers/mapa.ts server/routers/__tests__/mapa.test.ts server/_core/trpc.ts
git commit -m "feat(server): mapa router with densidad + compliance + familiasInDistrito"
```

---

### Task 8: Mapa tab — choropleth component

**Files:**
- Create: `client/src/features/mapa-tab/index.tsx`
- Create: `client/src/features/mapa-tab/MapaChoropleth.tsx`
- Create: `client/src/features/mapa-tab/LayerToggle.tsx`
- Create: `client/src/features/mapa-tab/DistritoPanel.tsx`
- Create: `client/src/features/mapa-tab/hooks/useMapaData.ts`
- Test: `client/src/features/mapa-tab/__tests__/MapaChoropleth.test.tsx`

- [ ] **Step 1: Install dependencies**

```bash
pnpm add react-leaflet leaflet
pnpm add -D @types/leaflet
```

- [ ] **Step 2: Hook**

```typescript
// client/src/features/mapa-tab/hooks/useMapaData.ts
import { trpc } from "@/lib/trpc";

export function useMapaData(layer: "densidad" | "compliance", periodoDays: 0 | 30 | 90 | 365) {
  const densidad = trpc.mapa.densidad.useQuery({ estado: "activa", periodoDays }, { enabled: layer === "densidad" });
  const compliance = trpc.mapa.compliance.useQuery({ estado: "activa", periodoDays }, { enabled: layer === "compliance" });
  return { densidad, compliance };
}
```

- [ ] **Step 3: `LayerToggle.tsx`**

```typescript
import { Button } from "@/components/ui/button";

interface LayerToggleProps {
  layer: "densidad" | "compliance";
  onChange: (l: "densidad" | "compliance") => void;
}

export function LayerToggle({ layer, onChange }: LayerToggleProps) {
  return (
    <div className="inline-flex border rounded-md overflow-hidden">
      <Button
        variant={layer === "densidad" ? "default" : "ghost"}
        size="sm"
        onClick={() => onChange("densidad")}
        className="rounded-none"
      >
        Densidad
      </Button>
      <Button
        variant={layer === "compliance" ? "default" : "ghost"}
        size="sm"
        onClick={() => onChange("compliance")}
        className="rounded-none"
      >
        Compliance
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: `MapaChoropleth.tsx`**

```typescript
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import distritosGeoJson from "@/assets/madrid-distritos.geojson?url";
import { useEffect, useMemo, useState } from "react";
import type { Feature, FeatureCollection } from "geojson";

interface MapaChoroplethProps {
  values: Map<string, number>;        // distrito-slug → metric value
  maxValue: number;                    // for color scale
  formatTooltip: (slug: string, value: number) => string;
  onDistritoClick: (slug: string) => void;
  // K-anonymity floor — distritos with total < threshold are rendered neutral
  neutralPredicate?: (slug: string) => boolean;
}

function colorForValue(v: number, max: number): string {
  if (max <= 0) return "#e5e7eb";
  const t = Math.min(1, v / max);
  // Light → dark red gradient
  const r = Math.round(254 - (254 - 127) * t);
  const g = Math.round(229 - (229 - 29) * t);
  const b = Math.round(217 - (217 - 29) * t);
  return `rgb(${r},${g},${b})`;
}

export function MapaChoropleth({ values, maxValue, formatTooltip, onDistritoClick, neutralPredicate }: MapaChoroplethProps) {
  const [geo, setGeo] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    fetch(distritosGeoJson)
      .then(r => r.json())
      .then((j: FeatureCollection) => setGeo(j))
      .catch(() => setGeo(null));
  }, []);

  const styleFn = useMemo(() => (feature?: Feature) => {
    const slug = feature?.properties?.slug as string | undefined;
    const isNeutral = !slug || (neutralPredicate?.(slug) ?? false);
    const v = (slug ? values.get(slug) : 0) ?? 0;
    return {
      fillColor: isNeutral ? "#e5e7eb" : colorForValue(v, maxValue),
      weight: 1,
      opacity: 1,
      color: "#94a3b8",
      fillOpacity: 0.7,
    };
  }, [values, maxValue, neutralPredicate]);

  const onEachFeature = useMemo(() => (feature: Feature, layer: { bindTooltip: (t: string) => void; on: (e: string, h: () => void) => void }) => {
    const slug = feature.properties?.slug as string | undefined;
    const v = (slug ? values.get(slug) : 0) ?? 0;
    if (slug) {
      layer.bindTooltip(formatTooltip(slug, v));
      layer.on("click", () => onDistritoClick(slug));
    }
  }, [values, formatTooltip, onDistritoClick]);

  if (!geo) return <div className="h-96 flex items-center justify-center text-muted-foreground">Cargando mapa...</div>;

  return (
    <MapContainer center={[40.4168, -3.7038]} zoom={11} className="h-[600px] w-full rounded-md overflow-hidden">
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap'
      />
      <GeoJSON data={geo as never} style={styleFn} onEachFeature={onEachFeature} />
    </MapContainer>
  );
}
```

NOTE for implementer: the GeoJSON's `properties` field must include a `slug` matching the `DistritoSlug` enum. If the public-domain GeoJSON uses a different property name (e.g. `nombre`, `cod_distrito`), write a small one-time transform script under `scripts/normalize-distritos-geojson.ts` that reads the raw GeoJSON, matches each feature's name to a slug from `MADRID_DISTRITOS`, and writes the normalized file. Run it once and commit the output.

- [ ] **Step 5: `DistritoPanel.tsx`**

```typescript
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { MADRID_DISTRITOS } from "@/../../shared/madrid/distritos";

interface DistritoPanelProps {
  slug: string | null;
  total: number;
  conRiesgo?: number;
  layer: "densidad" | "compliance";
}

export function DistritoPanel({ slug, total, conRiesgo, layer }: DistritoPanelProps) {
  if (!slug) return null;
  const nombre = MADRID_DISTRITOS.find(d => d.slug === slug)?.nombre ?? slug;
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="font-medium">{nombre}</div>
        <div className="text-sm text-muted-foreground">
          {layer === "densidad"
            ? `${total} familia${total === 1 ? "" : "s"} activa${total === 1 ? "" : "s"}`
            : `${conRiesgo ?? 0}/${total} con riesgo`}
        </div>
        <Link href={`/programas/programa_familias?tab=familias&distrito=${slug}`}>
          <a><Button size="sm" variant="outline">Ver familias →</Button></a>
        </Link>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Compose the tab**

```typescript
// client/src/features/mapa-tab/index.tsx
import { useMemo, useState } from "react";
import { LayerToggle } from "./LayerToggle";
import { MapaChoropleth } from "./MapaChoropleth";
import { DistritoPanel } from "./DistritoPanel";
import { useMapaData } from "./hooks/useMapaData";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface MapaTabProps { programaId: string }

export default function MapaTab(_props: MapaTabProps) {
  const [layer, setLayer] = useState<"densidad" | "compliance">("densidad");
  const [periodoDays, setPeriodoDays] = useState<0 | 30 | 90 | 365>(0);
  const [selected, setSelected] = useState<string | null>(null);

  const { densidad, compliance } = useMapaData(layer, periodoDays);

  const { values, maxValue, neutral, conRiesgoFor } = useMemo(() => {
    if (layer === "densidad") {
      const rows = densidad.data ?? [];
      const m = new Map<string, number>();
      let max = 0;
      for (const r of rows) { m.set(r.distrito, r.total); if (r.total > max) max = r.total; }
      return { values: m, maxValue: max, neutral: (s: string) => (m.get(s) ?? 0) < 3, conRiesgoFor: (_s: string) => 0 };
    } else {
      const rows = compliance.data ?? [];
      const ratio = new Map<string, number>();
      const totals = new Map<string, number>();
      const riesgos = new Map<string, number>();
      let max = 0;
      for (const r of rows) {
        totals.set(r.distrito, r.total);
        riesgos.set(r.distrito, r.conRiesgo);
        const v = r.total > 0 ? r.conRiesgo / r.total : 0;
        ratio.set(r.distrito, v);
        if (v > max) max = v;
      }
      return {
        values: ratio,
        maxValue: max,
        neutral: (s: string) => (totals.get(s) ?? 0) < 3,
        conRiesgoFor: (s: string) => riesgos.get(s) ?? 0,
      };
    }
  }, [layer, densidad.data, compliance.data]);

  const totalFor = (slug: string): number => {
    if (layer === "densidad") return values.get(slug) ?? 0;
    return (compliance.data ?? []).find(r => r.distrito === slug)?.total ?? 0;
  };

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-3">
        <LayerToggle layer={layer} onChange={setLayer} />
        <Select value={String(periodoDays)} onValueChange={(v) => setPeriodoDays(Number(v) as 0 | 30 | 90 | 365)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Histórico completo</SelectItem>
            <SelectItem value="30">Últimos 30 días</SelectItem>
            <SelectItem value="90">Últimos 90 días</SelectItem>
            <SelectItem value="365">Últimos 365 días</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <MapaChoropleth
        values={values}
        maxValue={maxValue}
        neutralPredicate={neutral}
        formatTooltip={(slug, v) => layer === "densidad"
          ? `${slug}: ${v} familia${v === 1 ? "" : "s"}`
          : `${slug}: ${(v * 100).toFixed(0)}% con riesgo`}
        onDistritoClick={setSelected}
      />

      {selected && (
        <DistritoPanel
          slug={selected}
          total={totalFor(selected)}
          conRiesgo={conRiesgoFor(selected)}
          layer={layer}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Flip the Mapa tab from disabled → enabled in `<ProgramTabs />`**

In `client/src/features/programs/components/ProgramTabs.tsx`:

```typescript
const PHASE1_ENABLED: ProgramTab[] = ["familias", "uploads", "mapa"];

const MapaTab = lazy(() => import("@/features/mapa-tab"));

// ... in render, replace the disabled <renderDisabledTrigger("mapa")> with:
<TabsTrigger value="mapa">{TAB_LABELS.mapa}</TabsTrigger>

// ... and add the TabsContent:
<TabsContent value="mapa">
  <Suspense fallback={<TabFallback />}>
    {PHASE1_ENABLED.includes("mapa") && <MapaTab programaId={program.id} />}
  </Suspense>
</TabsContent>
```

- [ ] **Step 8: Smoke test**

```bash
pnpm dev
# /programas/programa_familias?tab=mapa
# Expect: Madrid map renders, distritos colored by family-count gradient, click a distrito → side panel
# Switch to Compliance layer, recolor happens, click → side panel shows X/Y con riesgo
# Click "Ver familias →" → navigates to ?tab=familias with distrito filter
```

NOTE: Familias tab needs to consume the `distrito` URL param too. Add to `useFamiliasFilters` (`distrito?: string` field) and pipe into the `families.getAll` query. Today `families.getAll` doesn't accept `distrito` — extend the input schema in `server/routers/families/crud.ts`:

```typescript
distrito: z.string().optional(),
// in the query:
if (input?.distrito) query = query.eq("distrito", input.distrito);
```

- [ ] **Step 9: Commit (split into logical commits)**

```bash
git add client/src/features/mapa-tab pnpm-lock.yaml package.json
git commit -m "feat(mapa-tab): choropleth with Densidad + Compliance layers and distrito drill-in"
git add client/src/features/programs/components/ProgramTabs.tsx
git commit -m "feat(program-tabs): enable Mapa tab in ProgramTabs"
git add server/routers/families/crud.ts client/src/features/familias-tab/hooks/useFamiliasFilters.ts client/src/lib/database.types.ts
git commit -m "feat(familias-tab): accept distrito filter from Mapa drilldown"
```

---

### Task 9: Reports — saved-queries schema + entity allowlist

**Files:**
- Create: `supabase/migrations/<NEXT_TS+2>_create_report_saved_queries.sql`
- Create: `shared/reports/savedQuerySpec.ts`
- Create: `shared/reports/entities.ts`
- Test: `shared/reports/__tests__/savedQuerySpec.test.ts`

- [ ] **Step 1: Migration**

```sql
CREATE TABLE IF NOT EXISTS report_saved_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  programa_id uuid REFERENCES programs(id) ON DELETE SET NULL,
  nombre text NOT NULL,
  descripcion text,
  spec_json jsonb NOT NULL,
  is_shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE report_saved_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rsq_admin_read"
  ON report_saved_queries FOR SELECT
  TO authenticated
  USING (
    get_user_role() IN ('admin','superadmin') AND
    (user_id = (auth.jwt() ->> 'sub') OR is_shared = true)
  );

CREATE POLICY "rsq_admin_write"
  ON report_saved_queries FOR ALL
  TO authenticated
  USING (get_user_role() IN ('admin','superadmin') AND user_id = (auth.jwt() ->> 'sub'))
  WITH CHECK (get_user_role() IN ('admin','superadmin') AND user_id = (auth.jwt() ->> 'sub'));

CREATE TRIGGER rsq_updated_at BEFORE UPDATE ON report_saved_queries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

- [ ] **Step 2: Entity allowlist**

`shared/reports/entities.ts`:

```typescript
export const REPORT_ENTITIES = ["families", "persons", "miembros", "documents", "deliveries"] as const;
export type ReportEntity = (typeof REPORT_ENTITIES)[number];

interface FieldDef {
  name: string;
  label: string;
  type: "string" | "number" | "boolean" | "date" | "enum";
  enumValues?: readonly string[];
  filterable: boolean;
  groupable: boolean;
  aggregable: false | ("count" | "sum" | "avg" | "min" | "max")[];
}

export const ENTITY_FIELDS: Readonly<Record<ReportEntity, readonly FieldDef[]>> = Object.freeze({
  families: [
    { name: "estado", label: "Estado", type: "enum", enumValues: ["activa","baja"], filterable: true, groupable: true, aggregable: false },
    { name: "distrito", label: "Distrito", type: "string", filterable: true, groupable: true, aggregable: false },
    { name: "alta_en_guf", label: "Alta GUF", type: "boolean", filterable: true, groupable: true, aggregable: false },
    { name: "informe_social", label: "Informe social", type: "boolean", filterable: true, groupable: true, aggregable: false },
    { name: "padron_recibido", label: "Padrón recibido", type: "boolean", filterable: true, groupable: true, aggregable: false },
    { name: "num_adultos", label: "Núm. adultos", type: "number", filterable: true, groupable: false, aggregable: ["count","sum","avg","min","max"] },
    { name: "num_menores_18", label: "Núm. menores", type: "number", filterable: true, groupable: false, aggregable: ["count","sum","avg","min","max"] },
    { name: "created_at", label: "Fecha de alta", type: "date", filterable: true, groupable: false, aggregable: ["count","min","max"] },
    { name: "id", label: "ID", type: "string", filterable: false, groupable: false, aggregable: ["count"] },
  ],
  persons: [
    { name: "estado", label: "Estado", type: "enum", enumValues: ["activo","inactivo"], filterable: true, groupable: true, aggregable: false },
    { name: "distrito", label: "Distrito", type: "string", filterable: true, groupable: true, aggregable: false },
    { name: "fase_itinerario", label: "Fase itinerario", type: "enum", enumValues: ["0","1","2","3","4"], filterable: true, groupable: true, aggregable: false },
    { name: "idioma_principal", label: "Idioma principal", type: "string", filterable: true, groupable: true, aggregable: false },
    { name: "pais_nacionalidad", label: "Nacionalidad", type: "string", filterable: true, groupable: true, aggregable: false },
    { name: "id", label: "ID", type: "string", filterable: false, groupable: false, aggregable: ["count"] },
  ],
  miembros: [
    { name: "relacion", label: "Relación", type: "string", filterable: true, groupable: true, aggregable: false },
    { name: "id", label: "ID", type: "string", filterable: false, groupable: false, aggregable: ["count"] },
  ],
  documents: [
    { name: "tipo", label: "Tipo", type: "string", filterable: true, groupable: true, aggregable: false },
    { name: "created_at", label: "Subido", type: "date", filterable: true, groupable: false, aggregable: ["count"] },
    { name: "id", label: "ID", type: "string", filterable: false, groupable: false, aggregable: ["count"] },
  ],
  deliveries: [
    { name: "fecha", label: "Fecha", type: "date", filterable: true, groupable: true, aggregable: ["count"] },
    { name: "id", label: "ID", type: "string", filterable: false, groupable: false, aggregable: ["count"] },
  ],
});

export const ENTITY_TO_TABLE: Readonly<Record<ReportEntity, string>> = Object.freeze({
  families: "families",
  persons: "persons",
  miembros: "familia_miembros",
  documents: "family_member_documents",
  deliveries: "deliveries",
});
```

- [ ] **Step 3: SavedQuerySpec Zod**

`shared/reports/savedQuerySpec.ts`:

```typescript
import { z } from "zod";
import { REPORT_ENTITIES, ENTITY_FIELDS, type ReportEntity } from "./entities";

const OperatorSchema = z.enum(["eq","neq","gt","gte","lt","lte","in","contains","is_null","between"]);

const FilterRowSchema = z.object({
  field: z.string(),
  operator: OperatorSchema,
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]).optional(),
  // For 'between'
  value2: z.union([z.string(), z.number()]).optional(),
});

export const SavedQuerySpecSchema = z.object({
  entity: z.enum([...REPORT_ENTITIES] as [ReportEntity, ...ReportEntity[]]),
  filters: z.array(FilterRowSchema).max(10).default([]),
  groupBy: z.string().optional(),
  aggregate: z.object({
    op: z.enum(["count","sum","avg","min","max"]),
    field: z.string(),
  }).optional(),
  orderBy: z.object({
    field: z.string(),
    direction: z.enum(["asc","desc"]).default("desc"),
  }).optional(),
  limit: z.number().int().min(1).max(10000).default(1000),
}).superRefine((spec, ctx) => {
  // Field-level allowlist enforcement.
  const fields = ENTITY_FIELDS[spec.entity];
  const has = (name: string) => fields.some(f => f.name === name);
  const filterable = (name: string) => fields.find(f => f.name === name)?.filterable === true;
  const groupable = (name: string) => fields.find(f => f.name === name)?.groupable === true;
  const aggregableOps = (name: string) => fields.find(f => f.name === name)?.aggregable;

  spec.filters.forEach((f, i) => {
    if (!has(f.field)) ctx.addIssue({ code: "custom", path: ["filters", i, "field"], message: `Field '${f.field}' not in allowlist for ${spec.entity}` });
    else if (!filterable(f.field)) ctx.addIssue({ code: "custom", path: ["filters", i, "field"], message: `Field '${f.field}' is not filterable` });
  });

  if (spec.groupBy) {
    if (!has(spec.groupBy)) ctx.addIssue({ code: "custom", path: ["groupBy"], message: `Field '${spec.groupBy}' not in allowlist` });
    else if (!groupable(spec.groupBy)) ctx.addIssue({ code: "custom", path: ["groupBy"], message: `Field '${spec.groupBy}' is not groupable` });
  }

  if (spec.aggregate) {
    if (!has(spec.aggregate.field)) ctx.addIssue({ code: "custom", path: ["aggregate", "field"], message: `Field '${spec.aggregate.field}' not in allowlist` });
    else {
      const ops = aggregableOps(spec.aggregate.field);
      if (!ops || !ops.includes(spec.aggregate.op)) {
        ctx.addIssue({ code: "custom", path: ["aggregate", "op"], message: `Operation '${spec.aggregate.op}' not allowed on '${spec.aggregate.field}'` });
      }
    }
  }
});

export type SavedQuerySpec = z.infer<typeof SavedQuerySpecSchema>;
```

- [ ] **Step 4: Test**

```typescript
import { describe, it, expect } from "vitest";
import { SavedQuerySpecSchema } from "../savedQuerySpec";

describe("SavedQuerySpecSchema", () => {
  it("accepts a minimal valid spec", () => {
    const result = SavedQuerySpecSchema.safeParse({ entity: "families", filters: [], limit: 100 });
    expect(result.success).toBe(true);
  });

  it("rejects unknown field in filter", () => {
    const result = SavedQuerySpecSchema.safeParse({
      entity: "families",
      filters: [{ field: "evil_field", operator: "eq", value: 1 }],
      limit: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-aggregable op on a string field", () => {
    const result = SavedQuerySpecSchema.safeParse({
      entity: "families",
      filters: [],
      aggregate: { op: "sum", field: "estado" },
      limit: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects ungroupable field in groupBy", () => {
    const result = SavedQuerySpecSchema.safeParse({
      entity: "families",
      filters: [],
      groupBy: "id",
      limit: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects limit > 10000", () => {
    const result = SavedQuerySpecSchema.safeParse({ entity: "families", filters: [], limit: 99999 });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 5: Run + commit**

```bash
pnpm test --run shared/reports/__tests__/savedQuerySpec.test.ts
git add shared/reports supabase/migrations/<NEXT_TS+2>_create_report_saved_queries.sql client/src/lib/database.types.ts
git commit -m "feat(reports): SavedQuerySpec Zod with allowlists + report_saved_queries table"
```

---

### Task 10: Reports — custom-query executor

**Files:**
- Create: `server/routers/reports/customQuery.ts`
- Test: `server/routers/__tests__/customQuery.test.ts`

- [ ] **Step 1: Implement the executor**

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { SavedQuerySpecSchema, type SavedQuerySpec } from "../../../shared/reports/savedQuerySpec";
import { ENTITY_TO_TABLE } from "../../../shared/reports/entities";

function applyFilter(q: ReturnType<ReturnType<typeof createAdminClient>["from"]>, f: SavedQuerySpec["filters"][number]) {
  switch (f.operator) {
    case "eq":       return q.eq(f.field, f.value as never);
    case "neq":      return q.neq(f.field, f.value as never);
    case "gt":       return q.gt(f.field, f.value as never);
    case "gte":      return q.gte(f.field, f.value as never);
    case "lt":       return q.lt(f.field, f.value as never);
    case "lte":      return q.lte(f.field, f.value as never);
    case "in":       return q.in(f.field, f.value as readonly never[]);
    case "contains": return q.ilike(f.field, `%${f.value}%`);
    case "is_null":  return q.is(f.field, null);
    case "between":  return q.gte(f.field, f.value as never).lte(f.field, f.value2 as never);
  }
}

export const customQueryRouter = router({
  execute: adminProcedure
    .input(SavedQuerySpecSchema)
    .query(async ({ input }) => {
      const db = createAdminClient();
      const table = ENTITY_TO_TABLE[input.entity];
      let q = db.from(table).select("*", { count: "exact" });

      for (const f of input.filters) {
        q = applyFilter(q, f);
      }

      if (input.orderBy) {
        q = q.order(input.orderBy.field, { ascending: input.orderBy.direction === "asc" });
      }
      q = q.limit(input.limit);

      const { data, error, count } = await q;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      // Group-by + aggregate is performed client-side over the returned rows
      // (capped at limit). This is an intentional v1 simplification — keep
      // SQL aggregation behind a separate procedure when row counts grow.
      let rows: unknown[] = data ?? [];
      if (input.groupBy && input.aggregate) {
        const groups = new Map<string, unknown[]>();
        for (const row of (rows as Record<string, unknown>[])) {
          const k = String((row)[input.groupBy] ?? "—");
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k)!.push(row);
        }
        const out: { group: string; value: number }[] = [];
        for (const [k, vs] of groups) {
          const op = input.aggregate.op;
          const f = input.aggregate.field;
          if (op === "count") {
            out.push({ group: k, value: vs.length });
          } else {
            const nums = vs.map(v => Number((v as Record<string, unknown>)[f])).filter(n => !isNaN(n));
            if (op === "sum") out.push({ group: k, value: nums.reduce((a, b) => a + b, 0) });
            if (op === "avg") out.push({ group: k, value: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0 });
            if (op === "min") out.push({ group: k, value: nums.length ? Math.min(...nums) : 0 });
            if (op === "max") out.push({ group: k, value: nums.length ? Math.max(...nums) : 0 });
          }
        }
        rows = out;
      }

      return { rows, total: count ?? rows.length };
    }),

  list: adminProcedure
    .input(z.object({ programaId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = createAdminClient();
      let q = db.from("report_saved_queries").select("*")
        .or(`user_id.eq.${ctx.user.id},is_shared.eq.true`)
        .order("created_at", { ascending: false });
      if (input?.programaId) q = q.eq("programa_id", input.programaId);
      const { data, error } = await q;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  save: adminProcedure
    .input(z.object({
      programaId: z.string().uuid().optional(),
      nombre: z.string().min(1).max(100),
      descripcion: z.string().max(500).optional(),
      spec: SavedQuerySpecSchema,
      isShared: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = createAdminClient();
      const { data, error } = await db.from("report_saved_queries").insert({
        user_id: String(ctx.user.id),
        programa_id: input.programaId ?? null,
        nombre: input.nombre,
        descripcion: input.descripcion ?? null,
        spec_json: input.spec,
        is_shared: input.isShared,
      }).select().single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = createAdminClient();
      const { error } = await db.from("report_saved_queries").delete()
        .eq("id", input.id).eq("user_id", String(ctx.user.id));
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),
});
```

- [ ] **Step 2: Test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { customQueryRouter } from "../reports/customQuery";
import type { Context } from "../../_core/context";

const ctx = (): Context => ({
  user: { id: "u", role: "admin", openId: "u" },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  correlationId: "t",
} as Context);

describe("customQuery executor", () => {
  it("rejects an evil field in filter", async () => {
    const caller = customQueryRouter.createCaller(ctx());
    await expect(caller.execute({
      entity: "families",
      filters: [{ field: "DROP TABLE families;--", operator: "eq", value: 1 }],
      limit: 10,
    } as never)).rejects.toThrow();
  });

  it("rejects an aggregate on a non-aggregable field", async () => {
    const caller = customQueryRouter.createCaller(ctx());
    await expect(caller.execute({
      entity: "families",
      filters: [],
      aggregate: { op: "sum", field: "estado" },
      limit: 10,
    } as never)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add server/routers/reports/customQuery.ts server/routers/__tests__/customQuery.test.ts
git commit -m "feat(reports): custom-query executor with allowlist enforcement and saved-query CRUD"
```

---

### Task 11: Reports — 9 templated reports

**Files:**
- Create: `server/routers/reports/templated/<one file each>` (9 files)
- Create: `server/routers/reports/index.ts`
- Modify: `server/_core/trpc.ts`

For brevity, one template-report file is shown in full below. The other 8 follow the same pattern. The implementer should mirror this structure.

- [ ] **Step 1: Implement `familiasAtendidas.ts`**

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../../_core/trpc";
import { createAdminClient } from "../../../../client/src/lib/supabase/server";

export const familiasAtendidasRouter = router({
  familiasAtendidas: adminProcedure
    .input(z.object({
      from: z.string(), // ISO date
      to: z.string(),   // ISO date
    }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db.from("families")
        .select("id, familia_numero, estado, num_adultos, num_menores_18, distrito, created_at, persons!titular_id(nombre, apellidos)")
        .gte("created_at", input.from)
        .lte("created_at", input.to)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return {
        rows: data ?? [],
        meta: {
          totalFamilias: (data ?? []).length,
          totalPersonas: (data ?? []).reduce((s, f) => s + (f.num_adultos ?? 0) + (f.num_menores_18 ?? 0), 0),
        },
      };
    }),
});
```

- [ ] **Step 2: Implement the remaining 8 in the same shape**

Files (one query proc per file):
- `padronPorVencer.ts` — `padronPorVencer({ daysAhead: 30 })` → families with `padron_recibido_fecha + 6 months <= today + daysAhead` (compute the cutoff in JS).
- `informesPorRenovar.ts` — `informesPorRenovar({ daysAhead: 30 })` → families with `informe_social_fecha + 12 months <= today + daysAhead`.
- `complianceSnapshot.ts` — wraps `families.getComplianceStats` from `server/routers/families/compliance.ts`.
- `familiasEnRiesgo.ts` — same logic as Mapa compliance, returns the list of "red-flag" families.
- `documentosFaltantes.ts` — for each `program_document_types` row (active, scope=familia/miembro, is_required=true), join families and report missing docs.
- `resumenTrimestral.ts` — `resumenTrimestral({ year, quarter })` → KPIs: nuevas familias, total entregas, total miembros únicos, distribución por distrito.
- `distribucionPorDistrito.ts` — count active families grouped by `distrito`.
- `evolucionHistorica.ts` — last 12 months: count of new families per month.

Each file follows the same shape: one `adminProcedure.input(zodSchema).query(handler)`.

- [ ] **Step 3: Compose `reports/index.ts`**

```typescript
import { mergeRouters } from "../../_core/trpc";
import { customQueryRouter } from "./customQuery";
import { familiasAtendidasRouter } from "./templated/familiasAtendidas";
import { padronPorVencerRouter } from "./templated/padronPorVencer";
import { informesPorRenovarRouter } from "./templated/informesPorRenovar";
import { complianceSnapshotRouter } from "./templated/complianceSnapshot";
import { familiasEnRiesgoRouter } from "./templated/familiasEnRiesgo";
import { documentosFaltantesRouter } from "./templated/documentosFaltantes";
import { resumenTrimestralRouter } from "./templated/resumenTrimestral";
import { distribucionPorDistritoRouter } from "./templated/distribucionPorDistrito";
import { evolucionHistoricaRouter } from "./templated/evolucionHistorica";

export const reportsRouter = mergeRouters(
  customQueryRouter,
  familiasAtendidasRouter,
  padronPorVencerRouter,
  informesPorRenovarRouter,
  complianceSnapshotRouter,
  familiasEnRiesgoRouter,
  documentosFaltantesRouter,
  resumenTrimestralRouter,
  distribucionPorDistritoRouter,
  evolucionHistoricaRouter,
);
```

- [ ] **Step 4: Wire + smoke test + commit**

```bash
# in server/_core/trpc.ts: appRouter.reports = reportsRouter
pnpm test --run server/routers/__tests__/customQuery.test.ts
# (per-template tests are sized for the implementer; one test per file is adequate.)
git add server/routers/reports server/_core/trpc.ts
git commit -m "feat(reports): 9 templated reports + index router"
```

---

### Task 12: Reports tab UI — templates grid + custom query builder

**Files:**
- Create: `client/src/features/reports-tab/index.tsx`
- Create: `client/src/features/reports-tab/TemplatesGrid.tsx`
- Create: `client/src/features/reports-tab/CustomQueryBuilder.tsx`
- Create: `client/src/features/reports-tab/SavedQueriesList.tsx`
- Create: `client/src/features/reports-tab/utils/exportCsv.ts`
- Create: `client/src/features/reports-tab/templates/<9 modal components>` (one per templated report)
- Modify: `client/src/features/programs/components/ProgramTabs.tsx` (enable `reports`)

- [ ] **Step 1: `exportCsv.ts`**

```typescript
export function exportRowsAsCsv<T extends Record<string, unknown>>(rows: readonly T[], filename: string) {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    cols.join(","),
    ...rows.map(r => cols.map(c => escape(r[c])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: `TemplatesGrid.tsx`**

```typescript
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { FamiliasAtendidasModal } from "./templates/FamiliasAtendidasModal";
// ... import the other 8 modals

const TEMPLATES = [
  { key: "familiasAtendidas", section: "Operacional", title: "Familias atendidas por período", desc: "Listado de familias creadas en un rango de fechas." },
  { key: "padronPorVencer", section: "Operacional", title: "Padrón por vencer", desc: "Familias cuyo padrón vence en los próximos 30 días." },
  { key: "informesPorRenovar", section: "Operacional", title: "Informes por renovar", desc: "Informes sociales próximos a la renovación anual." },
  { key: "complianceSnapshot", section: "Compliance", title: "Compliance snapshot", desc: "Estado actual de CM-1..CM-6 a nivel programa." },
  { key: "familiasEnRiesgo", section: "Compliance", title: "Familias en riesgo", desc: "Lista de familias con uno o más flags rojos." },
  { key: "documentosFaltantes", section: "Compliance", title: "Documentos faltantes", desc: "Familias con tipos requeridos sin subir." },
  { key: "resumenTrimestral", section: "Financiadores", title: "Resumen trimestral", desc: "Métricas clave por trimestre." },
  { key: "distribucionPorDistrito", section: "Financiadores", title: "Distribución por distrito", desc: "Conteo de familias activas por distrito." },
  { key: "evolucionHistorica", section: "Financiadores", title: "Evolución histórica", desc: "Nuevas familias por mes (últimos 12)." },
];

export function TemplatesGrid() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const grouped = TEMPLATES.reduce<Record<string, typeof TEMPLATES>>((acc, t) => {
    (acc[t.section] ??= []).push(t);
    return acc;
  }, {});
  return (
    <>
      <div className="space-y-6">
        {Object.entries(grouped).map(([section, list]) => (
          <div key={section}>
            <div className="text-sm font-medium text-muted-foreground mb-2">{section}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {list.map(t => (
                <Card key={t.key} className="cursor-pointer hover:border-primary" onClick={() => setOpenKey(t.key)}>
                  <CardContent className="p-4">
                    <div className="font-medium">{t.title}</div>
                    <div className="text-sm text-muted-foreground mt-1">{t.desc}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      <FamiliasAtendidasModal open={openKey === "familiasAtendidas"} onClose={() => setOpenKey(null)} />
      {/* ... 8 more modals, one per template, each lazy-mounted by `open === key` */}
    </>
  );
}
```

- [ ] **Step 3: One template modal — `FamiliasAtendidasModal.tsx`**

```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { exportRowsAsCsv } from "../utils/exportCsv";

interface Props { open: boolean; onClose: () => void }

export function FamiliasAtendidasModal({ open, onClose }: Props) {
  const [from, setFrom] = useState(() => new Date(Date.now() - 90*24*60*60*1000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const result = trpc.reports.familiasAtendidas.useQuery({ from, to }, { enabled: open });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Familias atendidas por período</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Desde</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label>Hasta</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
          {result.data && (
            <>
              <div className="text-sm">
                <strong>{result.data.meta.totalFamilias}</strong> familias ·
                <strong className="ml-2">{result.data.meta.totalPersonas}</strong> personas
              </div>
              <div className="max-h-80 overflow-y-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Nº</th>
                      <th className="p-2 text-left">Titular</th>
                      <th className="p-2 text-left">Distrito</th>
                      <th className="p-2 text-left">Fecha alta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.rows.map((r) => {
                      const t = (r as { persons?: { nombre?: string; apellidos?: string } }).persons;
                      return (
                        <tr key={r.id} className="border-t">
                          <td className="p-2">#{r.familia_numero}</td>
                          <td className="p-2">{t?.nombre ?? ""} {t?.apellidos ?? ""}</td>
                          <td className="p-2">{r.distrito ?? "—"}</td>
                          <td className="p-2">{r.created_at ? new Date(r.created_at).toLocaleDateString("es-ES") : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => exportRowsAsCsv(result.data!.rows as never, `familias_atendidas_${from}_${to}.csv`)}>
                  Exportar CSV
                </Button>
                <Button onClick={onClose}>Cerrar</Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

The other 8 modals follow the same pattern (parameters → query → table + CSV button). Each parameter set is determined by its corresponding tRPC procedure.

- [ ] **Step 4: `CustomQueryBuilder.tsx`**

```typescript
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save, Play } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ENTITY_FIELDS, REPORT_ENTITIES, type ReportEntity } from "@/../../shared/reports/entities";
import type { SavedQuerySpec } from "@/../../shared/reports/savedQuerySpec";
import { exportRowsAsCsv } from "./utils/exportCsv";

export function CustomQueryBuilder({ programaId }: { programaId: string }) {
  const [entity, setEntity] = useState<ReportEntity>("families");
  const [filters, setFilters] = useState<SavedQuerySpec["filters"]>([]);
  const [groupBy, setGroupBy] = useState<string | undefined>();
  const [aggregate, setAggregate] = useState<SavedQuerySpec["aggregate"] | undefined>();
  const [limit, setLimit] = useState(1000);
  const [name, setName] = useState("");
  const [results, setResults] = useState<unknown[] | null>(null);

  const fields = ENTITY_FIELDS[entity];
  const filterableFields = fields.filter(f => f.filterable);
  const groupableFields = fields.filter(f => f.groupable);
  const aggregableFields = fields.filter(f => f.aggregable);

  const executeMutation = trpc.reports.execute.useMutation();
  const saveMutation = trpc.reports.save.useMutation();

  const onExecute = async () => {
    const spec: SavedQuerySpec = { entity, filters, groupBy, aggregate, limit };
    try {
      const r = await executeMutation.mutateAsync(spec);
      setResults((r as { rows: unknown[] }).rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  const onSave = async () => {
    if (!name.trim()) { toast.error("Nombre obligatorio"); return; }
    const spec: SavedQuerySpec = { entity, filters, groupBy, aggregate, limit };
    try {
      await saveMutation.mutateAsync({ programaId, nombre: name.trim(), spec, isShared: false });
      toast.success("Consulta guardada");
      setName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div>
          <Label>Entidad</Label>
          <Select value={entity} onValueChange={(v) => { setEntity(v as ReportEntity); setFilters([]); setGroupBy(undefined); setAggregate(undefined); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {REPORT_ENTITIES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Filtros</Label>
            <Button size="sm" variant="outline" onClick={() => setFilters([...filters, { field: filterableFields[0]?.name ?? "", operator: "eq", value: "" }])}>
              <Plus className="h-3 w-3 mr-1" /> Añadir filtro
            </Button>
          </div>
          {filters.map((f, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <Select value={f.field} onValueChange={(v) => { const nf = [...filters]; nf[i].field = v; setFilters(nf); }}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{filterableFields.map(ff => <SelectItem key={ff.name} value={ff.name}>{ff.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={f.operator} onValueChange={(v) => { const nf = [...filters]; nf[i].operator = v as never; setFilters(nf); }}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="eq">=</SelectItem><SelectItem value="neq">≠</SelectItem>
                  <SelectItem value="gt">&gt;</SelectItem><SelectItem value="gte">≥</SelectItem>
                  <SelectItem value="lt">&lt;</SelectItem><SelectItem value="lte">≤</SelectItem>
                  <SelectItem value="contains">contiene</SelectItem><SelectItem value="is_null">vacío</SelectItem>
                </SelectContent>
              </Select>
              <Input className="flex-1" value={String(f.value ?? "")} onChange={(e) => { const nf = [...filters]; nf[i].value = e.target.value; setFilters(nf); }} placeholder="Valor" />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFilters(filters.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Agrupar por (opcional)</Label>
            <Select value={groupBy ?? ""} onValueChange={(v) => setGroupBy(v || undefined)}>
              <SelectTrigger><SelectValue placeholder="Sin agrupar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— Sin agrupar —</SelectItem>
                {groupableFields.map(ff => <SelectItem key={ff.name} value={ff.name}>{ff.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Agregación (opcional)</Label>
            <div className="flex gap-2">
              <Select value={aggregate?.op ?? ""} onValueChange={(v) => setAggregate(v ? { op: v as never, field: aggregate?.field ?? "id" } : undefined)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— ninguna —</SelectItem>
                  <SelectItem value="count">count</SelectItem>
                  <SelectItem value="sum">sum</SelectItem>
                  <SelectItem value="avg">avg</SelectItem>
                  <SelectItem value="min">min</SelectItem>
                  <SelectItem value="max">max</SelectItem>
                </SelectContent>
              </Select>
              {aggregate && (
                <Select value={aggregate.field} onValueChange={(v) => setAggregate({ ...aggregate, field: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {aggregableFields.map(ff => <SelectItem key={ff.name} value={ff.name}>{ff.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Label>Límite:</Label>
          <Input type="number" min={1} max={10000} value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="w-32" />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Input placeholder="Nombre para guardar" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 max-w-xs" />
          <Button variant="outline" onClick={onSave}><Save className="h-4 w-4 mr-1" /> Guardar</Button>
          <Button onClick={onExecute}><Play className="h-4 w-4 mr-1" /> Ejecutar</Button>
        </div>

        {results && (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">{results.length} fila{results.length === 1 ? "" : "s"}</div>
            <div className="max-h-80 overflow-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>{Object.keys((results[0] as Record<string, unknown>) ?? {}).map(k => <th key={k} className="p-2 text-left">{k}</th>)}</tr>
                </thead>
                <tbody>
                  {(results.slice(0, 200) as Record<string, unknown>[]).map((row, i) => (
                    <tr key={i} className="border-t">{Object.values(row).map((v, j) => <td key={j} className="p-2">{String(v ?? "")}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="outline" onClick={() => exportRowsAsCsv(results as never, `consulta_${Date.now()}.csv`)}>Exportar CSV</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: `SavedQueriesList.tsx`**

```typescript
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props { onLoad: (spec: unknown) => void }

export function SavedQueriesList({ onLoad }: Props) {
  const list = trpc.reports.list.useQuery();
  const remove = trpc.reports.delete.useMutation();
  return (
    <Card>
      <CardContent className="p-3">
        <div className="font-medium mb-2">Consultas guardadas</div>
        <ul className="divide-y">
          {(list.data ?? []).map(q => (
            <li key={q.id} className="py-2 flex items-center justify-between">
              <div>
                <div className="font-medium">{q.nombre}</div>
                <div className="text-xs text-muted-foreground">{q.descripcion ?? ""}</div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => onLoad(q.spec_json)}>Cargar</Button>
                <Button size="sm" variant="ghost" onClick={async () => { await remove.mutateAsync({ id: q.id }); await list.refetch(); }}>Eliminar</Button>
              </div>
            </li>
          ))}
          {(list.data ?? []).length === 0 && <li className="py-2 text-sm text-muted-foreground">Sin consultas guardadas</li>}
        </ul>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Compose the tab**

```typescript
// client/src/features/reports-tab/index.tsx
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TemplatesGrid } from "./TemplatesGrid";
import { CustomQueryBuilder } from "./CustomQueryBuilder";
import { SavedQueriesList } from "./SavedQueriesList";

interface ReportsTabProps { programaId: string }

export default function ReportsTab({ programaId }: ReportsTabProps) {
  const [section, setSection] = useState<"templates" | "custom">("templates");
  return (
    <div className="space-y-3 p-4">
      <Tabs value={section} onValueChange={(v) => setSection(v as typeof section)}>
        <TabsList>
          <TabsTrigger value="templates">Plantillas</TabsTrigger>
          <TabsTrigger value="custom">Nuevo informe</TabsTrigger>
        </TabsList>
        <TabsContent value="templates"><TemplatesGrid /></TabsContent>
        <TabsContent value="custom" className="space-y-3">
          <SavedQueriesList onLoad={(_spec) => {/* future: hydrate the builder from spec */}} />
          <CustomQueryBuilder programaId={programaId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 7: Enable Reports tab in ProgramTabs**

```typescript
const PHASE1_ENABLED: ProgramTab[] = ["familias", "uploads", "mapa", "reports"];
const ReportsTab = lazy(() => import("@/features/reports-tab"));
// Replace the disabled trigger + add TabsContent for "reports"
```

- [ ] **Step 8: Smoke test**

```bash
pnpm dev
# /programas/programa_familias?tab=reports
# Expect: Plantillas tab with 9 cards grouped by section
# Click "Familias atendidas por período", set dates, see results, export CSV
# Switch to "Nuevo informe", build a query (entidad=families, filtro estado=activa, group by distrito), execute, save
```

- [ ] **Step 9: Commit**

```bash
git add client/src/features/reports-tab client/src/features/programs/components/ProgramTabs.tsx
git commit -m "feat(reports-tab): templates grid + custom query builder + saved queries"
```

---

### Task 13: Phase 2 verification + lint + typecheck + test

- [ ] **Step 1: Run full suite**

```bash
pnpm lint
pnpm check
pnpm test --run
```

- [ ] **Step 2: Manual smoke**

1. `/programas/programa_familias?tab=mapa` → map renders, layer toggle works, click drills into Familias.
2. `/programas/programa_familias?tab=reports` → templates render, click any card → modal with parameters → export CSV.
3. Custom query: build, execute, save, list, reload, delete.
4. Familias tab respects `?distrito=` URL param from Mapa drilldown.

- [ ] **Step 3: Update draft PR / open new PR**

```bash
git push
gh pr edit --add-label phase-2
# OR open follow-up PR for phase 2 if Phase 1 is already merged
```

---

## Self-review

- [ ] Spec coverage: Mapa (Densidad + Compliance, distrito drill-in) ✓ · Reports (9 templates + custom query + saved queries) ✓ · `codigo_postal` capture ✓ · K-anonymity floor (<3 → neutral) ✓.
- [ ] Placeholder scan: `<NEXT_TS>` is intentional. `pnpm-lock.yaml` updated by `pnpm add` in Task 8.
- [ ] Type consistency: `SavedQuerySpec` schema matches across server (Task 10) and client builder (Task 12). `DistritoSlug` enum is shared between TS map (Task 1) and SQL function via the drift test (Task 3).
- [ ] Phase 3 hook: `<ProgramTabs />` will flip `derivar` from disabled → enabled when Phase 3 ships.

---

**End of Phase 2 plan.** Phase 3 (Derivar + Instituciones + DOCX/PDF) follows in `2026-05-06-programa-familia-phase3.md`.
