# Phase 2 + Phase 3 — Codex Review Brief

> **Audience:** External technical reviewer (Codex).
> **Purpose:** Review the design, scope, and risk of Phase 2 and Phase 3 of the Programa de Familia 5-tab surface BEFORE implementation begins.
> **Authored:** 2026-05-07
> **Branch context:** Phase 1 deployed to production via PR #41 on `feat/programa-familia-5-tab-surface`. Phases 2 and 3 are implementation plans that have not yet been executed.
> **Related artifacts (committed in repo):**
> - Spec: [`docs/superpowers/specs/2026-05-06-programa-familia-5-tab-surface.md`](../specs/2026-05-06-programa-familia-5-tab-surface.md)
> - Phase 1 plan: [`docs/superpowers/plans/2026-05-06-programa-familia-phase1.md`](../plans/2026-05-06-programa-familia-phase1.md)
> - Phase 2 plan: [`docs/superpowers/plans/2026-05-06-programa-familia-phase2.md`](../plans/2026-05-06-programa-familia-phase2.md)
> - Phase 3 plan: [`docs/superpowers/plans/2026-05-06-programa-familia-phase3.md`](../plans/2026-05-06-programa-familia-phase3.md)

---

## 0. Executive summary

The Programa de Familia surface in `bocatas_digital` was reorganised in Phase 1 (deployed) into 5 tabs inside `/programas/programa_familias`: **Familias** (live), **Mapa** (Phase 2), **Reports** (Phase 2), **Uploads** (live), **Derivar** (Phase 3). Phases 2 and 3 complete the surface and add one global capability — Derivar/intervención tracking — that any program in the platform can mount.

**Phase 2 — Mapa + Reports**
- Aggregate spatial view of Madrid-distrito families with two layers (density and compliance).
- Templated report library (9 cards) plus a guarded custom-query builder.
- Enables `codigo_postal` → `distrito` derivation on `families` and `persons`.

**Phase 3 — Derivar + Instituciones + DOCX/PDF**
- Per-(persona|familia, programa) intervention log mirroring the Bocatas paper artifact "Hoja de Registro de Derivaciones e Intervenciones".
- Global `instituciones` catalog reusable across programs.
- Server-side DOCX rendering (docxtemplater) + LibreOffice → PDF conversion of the official Hoja.
- Smart-prefill principle: every form pulls known data from the backend (read-only); only unknown fields are open inputs.

**What this brief asks of the reviewer:**
1. Validate the data-model decisions (sections 3 and 6).
2. Stress-test the RGPD posture (section 9).
3. Flag any place where scope creep can be cut without losing user value (section 10).
4. Confirm the Phase 2 / Phase 3 split is correctly sequenced.

---

## 1. Where Phases 2 and 3 sit in the bigger picture

```
/programas/programa_familias              <-- top-level page (Phase 1 ships)
└── ProgramTabs                            <-- 5-tab strip (Phase 1 ships)
    ├── Familias                           <-- Phase 1 LIVE (list + drawer + saved views)
    ├── Mapa                               <-- Phase 2 (this brief, §2-§5)
    ├── Reports                            <-- Phase 2 (this brief, §2-§5)
    ├── Uploads                            <-- Phase 1 LIVE (catalog + bulk + archive)
    └── Derivar                            <-- Phase 3 (this brief, §6-§8)

/admin/instituciones                       <-- Phase 3 (global catalog, all programs)
/admin/programas/:slug/tipos-documento     <-- Phase 1 LIVE (per-program doc-type registry)
```

The same `<ProgramTabs program={...} />` component already lights up Familias and Uploads for `programa_familias`. Phases 2 and 3 wire Mapa, Reports, and Derivar into that strip. Other programs (Comedor, Cesta Básica) inherit the same container; no changes are needed there until they mature.

---

## 2. Phase 2 — what gets built

### 2.1 Mapa tab

A choropleth of the 21 Madrid distritos with two switchable layers:

- **Densidad** — color = number of active families in the distrito.
- **Compliance** — color = % of active families in the distrito with one or more red CM-1..CM-6 flags (per `server/routers/families/compliance.ts`).

Interactivity: hover → tooltip; click distrito → side panel with stats and a "Ver lista de familias →" deep link to the Familias tab pre-filtered by distrito; layer toggle and period filter recolor in place.

**Library choice:** `react-leaflet` + OpenStreetMap tiles + a public-domain Madrid distritos GeoJSON. No Mapbox/Google = no API key, no third-party PII flow.

**Privacy floor:** distritos with fewer than 3 active families render neutral (k-anonymity floor), not as a coloured cell, to prevent single-family identification.

### 2.2 Reports tab

Two surfaces in one tab.

**Templated report library (9 cards in 3 sections):**
- *Operational:* Familias atendidas por período · Padrón por vencer · Informes por renovar
- *Compliance:* Compliance snapshot (CM-1..CM-6) · Familias en riesgo · Documentos faltantes
- *Financiadores:* Resumen trimestral · Distribución por distrito · Evolución histórica (12 meses)

Each card → modal with parameters → results (table + chart) → "Exportar CSV" / "Exportar PDF". One tRPC procedure per report under `server/routers/reports/<name>.ts`, each returning a Zod-validated typed shape.

**Custom query builder ("Nuevo informe"):**
- 5-step guided builder: entity → filters → group-by → aggregation → order/limit.
- Backed by a Zod-validated `SavedQuerySpec` with **per-entity allowlists** for fields, operators, group-by columns, and aggregable columns.
- Saved queries persisted to `report_saved_queries` (per-user, optionally `is_shared`).
- Server execution path is a parameterised Supabase query — no string concatenation, no `eval`. Hard cap of 10 000 rows.

### 2.3 Schema additions in Phase 2

- `families.codigo_postal text` + `families.distrito text` with a trigger that auto-sets `distrito` from `codigo_postal` via a static Madrid-postal-code map.
- Mirror columns on `persons`.
- New table `report_saved_queries` with RLS (own + shared visible to admins, write-own).
- Static map `shared/madrid/postalCodeToDistrito.ts` (~270 entries → 21 distritos).
- Madrid distritos GeoJSON committed under `client/src/assets/`.

### 2.4 Phase 2 file structure (high-level)

| Layer | Created |
|---|---|
| Schema | `add_codigo_postal_distrito_to_families.sql`, `add_codigo_postal_distrito_to_persons.sql`, `create_report_saved_queries.sql` |
| Shared | `shared/madrid/{distritos,postalCodeToDistrito}.ts`, `shared/reports/{savedQuerySpec,entities}.ts` |
| Server | `routers/mapa.ts`, `routers/reports/{customQuery,index}.ts`, 9 templated-report files |
| Client | `features/mapa-tab/*` (5 files), `features/reports-tab/*` + 9 template-modal files |
| Modified | `<ProgramTabs />` (enable mapa+reports), `RegistrationWizard/Step3Contacto` (new codigo_postal field), `families.getAll` (accept `distrito` filter) |

---

## 3. Phase 2 design decisions worth reviewing

### 3.1 Why distrito (21) rather than barrio (131) or service zone (custom)

- Distritos are public, stable Madrid administrative boundaries with public-domain GeoJSON.
- 21 cells make the visual readable. Barrio (131) would mostly be empty cells.
- Custom service zones would require a new `service_zones` table the team doesn't have today; deferred to a future phase.

### 3.2 Why postal code lookup, not address geocoding

- Avoids sending PII (addresses) to a third-party geocoder. EIPD-clean.
- Deterministic, free, offline-friendly. Fits the project's "no PII to 3rd parties unless documented in EIPD" posture.
- Postal code is one extra 5-digit field at registration; UX cost is low. Edge cases (postal codes that span 2 distritos — rare in Madrid) handled by picking a primary distrito in the static map.

### 3.3 Why a templated-cards library before a free query builder

- Sole and Espe (the primary social-services users) need answers fast, not a query interface. Cards cover the predictable funder-report shapes.
- The custom builder is for the cases the cards don't anticipate. It's optional power, not the primary entry point.
- Cards are also safer (no allowlist evaluation needed; each procedure is hand-written and reviewable).

### 3.4 Why `.strict()` allowlists on the saved-query schema

- Prevents arbitrary SQL through the saved-query interface.
- `SavedQuerySpec` with per-entity field/operator/group/aggregate allowlists means a malformed or malicious payload fails Zod parsing before reaching the database.
- The executor builds a Supabase query via the chained `.eq() / .or() / .order() / .range()` API — never raw SQL strings.

### 3.5 K-anonymity floor of 3

- Distritos with < 3 active families render neutral on the map.
- Project policy choice (not GDPR statute). Worth confirming with the RGPD lawyer before production rollout, but reasonable as a default.

---

## 4. Phase 2 risks + mitigations

| Risk | Mitigation in plan |
|---|---|
| Postal-code map in TS drifts from SQL trigger | Drift-detection test: glob the migration file, regex-extract every `WHEN '<code>'` clause, assert equals `Object.keys(POSTAL_CODE_TO_DISTRITO)`. CI fails if they diverge. |
| Existing families have no `codigo_postal` (cold-start data gap) | Migration leaves both columns NULL. Map renders these in a separate "Sin distrito asignado" panel. Backfill is an operational task for Sole, not a code change. |
| GeoJSON file is large / hurts initial bundle | Mapa tab is `React.lazy()`-chunked. GeoJSON loaded only when the tab opens. Total `react-leaflet + leaflet + GeoJSON` under 200 KB gzipped. |
| Custom-query allowlist false negatives (legitimate query rejected) | Allowlists are extended additively per entity. Adding a new field to the registry is a 1-line change and a unit test. |
| Custom-query result shape is unbounded text | Hard cap of 10 000 rows server-side; UI also slices the rendered table to 200 rows. CSV export uses streamed download, not in-memory aggregation. |
| Compliance layer aggregation is expensive on large datasets | Today families count is < 300. The compliance computation joins `families` with the existing `getComplianceStats` results; no per-distrito recomputation. If volume grows, materialised view is a one-line change. |

---

## 5. Phase 2 acceptance criteria

A reviewer or QA gate should validate:

- **Mapa**:
  - [ ] Madrid distritos GeoJSON renders without API key.
  - [ ] Densidad layer colours each distrito consistent with `families.getAll` count, filtered by current period.
  - [ ] Compliance layer colour matches the % of families in the distrito with at least one CM-1..CM-6 red flag.
  - [ ] Distritos with < 3 families render neutral; tooltip says "<3 familias".
  - [ ] Click → side panel; "Ver familias →" deep-link sets `?tab=familias&distrito=<slug>` correctly.

- **Reports — templates**:
  - [ ] Each of the 9 cards opens, takes parameters, and exports CSV/PDF.
  - [ ] All 9 procedures Zod-validate their input and return Zod-validated rows.
  - [ ] No card hard-codes Madrid distritos (uses `MADRID_DISTRITOS` constant).

- **Reports — custom builder**:
  - [ ] Builder rejects unknown entities, fields, operators, aggregations.
  - [ ] Builder rejects `limit > 10 000`.
  - [ ] Saved queries survive reload; `is_shared` toggle works for admins.
  - [ ] Drift-detection test for the postal-code map passes.

- **Cross-cutting**:
  - [ ] `<ProgramTabs />` renders Mapa and Reports as enabled tabs (no "Próximamente").
  - [ ] `codigo_postal` field on RegistrationWizard Step 3 validates to `^\d{5}$` and is optional.
  - [ ] `pnpm check`, `pnpm lint`, `pnpm test` green.

---

## 6. Phase 3 — what gets built

### 6.1 The Bocatas paper artifact this mirrors

The team produces a printed and signed paper document: **"Hoja de Registro de Derivaciones e Intervenciones"** (`260211 UZCATEGUI COLINA RAUL ALBERTO FAM 2422 DERIVACION MEDICOS DEL MUNDO.docx`). It has:

1. A header block: persona, nº unidad familiar, programa de referencia, profesional de referencia, fecha de apertura.
2. A growing table of interventions over time: Fecha · Tipo · Descripción · Recurso al que se deriva (institution + address + phone) · Observaciones · Firma.
3. A fixed RGPD footer.
4. Logos: Bocatas seal, Comunidad de Madrid + "Subvenciona 0,7% IRPF".
5. The instruction "*Cuando se añade un nuevo registro volver a imprimir y firmar las anteriores.*" (re-print + re-sign on every new row).

Phase 3 builds this in the database, surfaces it in a Derivar tab, and generates the official `.docx` and `.pdf` for printing.

### 6.2 Data model

**Three new domain tables, plus a shared catalog.**

```
instituciones (global, used by all programs)
├── id, nombre, tipo, areas[], direccion, codigo_postal, distrito,
│   telefono, email, notas, is_active

tipos_intervencion (DB-seeded; superadmin editable)
├── id, slug, nombre, display_order, is_active
└── seed: salud, apoyo_logistico, vivienda, juridico, empleo,
         alimentacion, infancia, salud_mental, formacion, otro

derivacion_hojas (header — one open hoja per (entity, programa))
├── id, scope ('persona'|'familia'), persona_id, familia_id, programa_id,
│   profesional_id, profesional_nombre (snapshotted),
│   fecha_apertura, estado ('activa'|'cerrada')
└── partial unique indexes:
    ├── (persona_id, programa_id) WHERE scope='persona' AND estado='activa'
    └── (familia_id, programa_id) WHERE scope='familia' AND estado='activa'

derivacion_intervenciones (rows — one per intervention)
├── id, hoja_id, fecha, tipo_slug, descripcion,
│   institucion_id, institucion_snapshot (jsonb, frozen at insert),
│   observaciones, firmado_url, firmado_at,
│   created_by, created_at
```

### 6.3 Why `institucion_snapshot` is critical

If Médicos del Mundo changes its address tomorrow, yesterday's printed Hoja must keep showing the original address (it's a printed signed document referencing a contact). We freeze a `{nombre, direccion, telefono, email, codigo_postal}` JSON snapshot at intervention-row insert. The institution row continues to evolve; the historical Hoja stays correct.

### 6.4 Smart-prefill UX

Per the user's explicit constraint ("the information must be gathered from backend when it has, other must open a form to the person to insert"):

A new tRPC procedure `derivar.startIntervention({ scope, entityId, programaId })` returns:

```typescript
{
  hoja: { id, fechaApertura, estado },           // existing or 'new' marker
  header: {                                       // read-only auto-fill
    nombre, numUnidadFamiliar,
    programaNombre, profesionalNombre,
    fechaAperturaISO,
  },
  defaults: {                                     // open inputs
    fechaISO,        // today
    tipoSlug,        // user picks
    descripcion,     // user types
    observaciones,   // optional
  },
}
```

The "+ Nueva intervención" form renders header fields as **read-only badges**. The user sees what we already know (their name, family number, program, profesional, fecha apertura) and only fills the unknowns. No re-typing of derivable data.

### 6.5 DOCX + PDF generation

`docxtemplater` fills the canonical Word template (uploaded to the `program-document-templates` Storage bucket as `derivacion_hoja_template_v1.docx`) with placeholders:

```
{nombre}, {numUnidadFamiliar}, {programaReferencia},
{profesionalReferencia}, {fechaApertura}
{#intervenciones}{fecha} {tipo} {descripcion}
                {recursoNombre} {recursoDireccion} {recursoTelefono}
                {observaciones} {firmaPlaceholder}
{/intervenciones}
```

Two tRPC procedures: `derivar.generateDocx({ hojaId })` returns base64 `.docx`. `derivar.generatePdf({ hojaId })` runs the same render and pipes the buffer through `libreoffice --headless --convert-to pdf` for browser-printable PDF.

### 6.6 Derivar UX

Inside the Derivar tab:
- List of interventions in the current program (filterable by tipo, institución, período, profesional).
- Click row → drawer with the **full Hoja** (header + every intervention for this entity in this program).
- "+ Nueva intervención" → smart-prefill form, including institución typeahead with inline "+ Crear nueva institución" modal.
- "Generar Word" / "Generar PDF" → file download.
- "Subir hoja firmada" → uploads scanned signed PDF, sets `firmado_url` + `firmado_at` on the latest intervention row.

### 6.7 Admin surface

`/admin/instituciones` (admin + superadmin) — CRUD on the global catalog. List, search, edit (superadmin only), deactivate. Reused by every program, not just Programa de Familia.

---

## 7. Phase 3 design decisions worth reviewing

### 7.1 Outbound-only in v1, no inbound tracking

The paper artifact only models outbound derivations ("Recurso al que se deriva"). Inbound flow (someone arrives at Bocatas because Cáritas referred them) is captured today as `persons.canal_llegada`, not as a separate intervention event. Locked: outbound only in v1.

### 7.2 No status field in v1

The paper artifact has no status column. Adding `pendiente / aceptada / rechazada / completada` would be useful but introduces a workflow we don't have stakeholder demand for. Locked: status deferred to v2.

### 7.3 `scope` per hoja is `persona` OR `familia`

The user said "it could be per person or per family". Schema models this with a `scope` field and a CHECK that exactly one of `persona_id` / `familia_id` is set. Two partial unique indexes enforce one-active-hoja-per-(entity, programa).

### 7.4 Why DB-seeded `tipos_intervencion`, not a TS enum

Tipos can grow over time (Sole or Espe might add categories). Using a DB table lets superadmins extend the list without engineering involvement. The 10 starter values are seeded on table creation.

### 7.5 Why docxtemplater + LibreOffice rather than a pure-JS PDF renderer

- The Bocatas team already has a canonical `.docx` template (with logos, RGPD footer, exact layout). Preserving visual fidelity in a hand-built `@react-pdf/renderer` template would be days of pixel-pushing.
- `docxtemplater` lets the team update the template without engineering involvement (replace the bucket file, bump the version constant).
- LibreOffice headless is well-documented, free, and battle-tested in NGO/government workflows.
- **Trade-off:** LibreOffice is a system-level dependency. The deploy container needs `apt-get install libreoffice` (~700 MB). Alternative: `gotenberg.dev` as a sidecar HTTP service, ~400 MB. Both options are documented in `docs/runbooks/libreoffice-setup.md`.

### 7.6 Why "find or create the open hoja" rather than "user creates hoja explicitly"

UX: from the user's perspective, there's only "+ Nueva intervención" with a person/familia picker. They don't think about hojas. The server upserts the open hoja for `(entity, programa)` on first intervention insert. Reduces clicks; matches the paper-artifact mental model where "the hoja is just where you write the intervention".

---

## 8. Phase 3 risks + mitigations

| Risk | Mitigation in plan |
|---|---|
| LibreOffice deploy infra dependency | Documented in runbook with three deployment paths (apt-get in container, gotenberg sidecar HTTP, dev-only `brew install`). |
| `docxtemplater` template-syntax errors crash rendering | Template is uploaded once by Bocatas; placeholder constants in `shared/derivar/templatePlaceholders.ts` are referenced from a single test that renders a known-good fixture. CI catches drift. |
| Concurrency: two callers writing to the same open hoja simultaneously | Partial unique indexes + transaction in `addIntervention` ensure only one open hoja per `(entity, programa)`. Race resolves to the second caller getting the existing hoja id. |
| EIPD: PDF generation is a new processing activity | Flagged in plan as a non-engineering blocker. EIPD addendum needed before production rollout. |
| Institución address changes break historical Hoja content | `institucion_snapshot` jsonb frozen at intervention-row insert time. Historical Hojas re-render with the original address even after the institution is updated. |
| Inline "+ Crear institución" allows admins to pollute the global catalog | Visible to all admins/superadmins per the plan. If governance becomes a problem, restrict creation to superadmins via `superadminProcedure`. |
| Tipo slug typo or removal breaks historical rows | `derivacion_intervenciones.tipo_slug REFERENCES tipos_intervencion(slug)`. Renaming a slug is blocked by the FK; deactivating (`is_active = false`) is the correct lifecycle action. |
| Plantilla DOCX file accidentally deleted | Storage bucket has versioning; CI tests render against a fixture, not the bucket. Recovery is a re-upload. |

---

## 9. RGPD posture (cross-cutting, applies to both phases)

| Concern | Handling |
|---|---|
| PII in URL params | None. Only filter, tab, and saved-view IDs are URL-state. |
| Distrito map identifiability | k-anonymity floor of 3. Distritos with fewer than 3 active families render neutral. |
| Derivar PDF generation = new processing activity | Requires EIPD addendum signed by RGPD lawyer (Sole owns this) before production. |
| Institución address persistence | Snapshotted at intervention insert; not a third-party data flow. |
| Custom-query builder data exposure | Allowlist evaluation runs server-side before any DB call. Volunteer-visibility filter (`volunteerVisibility.ts`) still applies on row return. |
| GeoJSON tile provider | OpenStreetMap public tile servers (no PII sent). Self-host option documented if the project ever wants to remove the dependency. |
| RLS posture | Service-role client (`createAdminClient()`) is the runtime; procedure middleware is the primary auth gate. RLS policies are defense-in-depth (per `ARCHITECTURE.md` §C1). |
| Document upload (signed Hoja) | Lives in existing `family-documents` bucket under a `derivaciones/` prefix. Bucket RLS already restricts to admin/superadmin. |
| Audit trail | `family_legacy_import_audit` exists for legacy import; no equivalent table is added in Phases 2/3. Consider if a `derivar_audit` table is needed before production (open question). |

---

## 10. Scope-cut recommendations to consider

If timeline pressure emerges, here are the cleanest cuts the reviewer should consider:

1. **Drop the custom-query builder from Phase 2.** Ship the 9 templated cards only. The builder is the largest chunk of new client code in Phase 2. Cards cover ~80 % of expected use.
2. **Drop "Subir hoja firmada" from Phase 3 v1.** The DOCX/PDF generation, intervention recording, and Hoja drawer are sufficient for the first user story (record + print + sign). Re-uploading the signed PDF can ship in v2.
3. **Drop PDF generation, ship DOCX only, in Phase 3 v1.** Removes the LibreOffice infra dependency. Users open the `.docx` in Word and print from there. Trade-off: less convenient for non-Word users; the team has Word.
4. **Defer the `instituciones` admin page to a follow-up.** The inline "+ Crear institución" modal during the Derivar flow is enough to bootstrap the catalog. A dedicated admin page is for ongoing maintenance, not initial value.

These are *optional*. The full plan is shippable as-is; cuts only matter if scope or time becomes constrained.

---

## 11. Sequencing — why Phase 2 before Phase 3

Phase 3 doesn't depend on Phase 2. Either order works.

**Reason for the proposed order (2 then 3):**
- Phase 2 reuses Phase 1's `<ProgramTabs />` strip and adds two more tabs to the same surface. Same UX team, same review cycle, low context switching.
- Phase 3 introduces new infrastructure (LibreOffice, docxtemplater, EIPD addendum process) that benefits from a fresh review window.
- Mapa and Reports surface insights the team can use immediately. Derivar is paperwork digitization; lower urgency.

**Counter-argument (Phase 3 first):**
- The Hoja artifact is a known weekly pain point for Sole. Mapping is "nice to have" until volume scales.
- If the team prioritises by *time saved per week*, Derivar first ships more value sooner.

The reviewer should weigh the two paths.

---

## 12. Acceptance criteria (Phase 3)

- **Schema**:
  - [ ] All 4 tables created with correct columns, FKs, and indexes.
  - [ ] Partial unique indexes prevent two open hojas per (entity, programa).
  - [ ] `tipos_intervencion` seeded with 10 starter rows.

- **Server**:
  - [ ] `derivar.startIntervention` returns the smart-prefill payload (header + defaults).
  - [ ] `derivar.addIntervention` upserts the open hoja and freezes `institucion_snapshot` at insert.
  - [ ] `derivar.generateDocx` renders the template with all placeholders correctly replaced.
  - [ ] `derivar.generatePdf` returns a print-ready PDF visually matching the canonical `.docx`.
  - [ ] `derivar.attachSigned` updates the latest intervention row's `firmado_url`/`firmado_at`.
  - [ ] All procedures rejected for non-admin/superadmin callers.

- **Client**:
  - [ ] Derivar tab is enabled in `<ProgramTabs />`.
  - [ ] List + drawer + smart-prefill form + institución typeahead all functional.
  - [ ] Inline "+ Crear institución" persists and re-enters the parent form.
  - [ ] `/admin/instituciones` lists, creates, edits, deactivates.

- **Operational**:
  - [ ] LibreOffice headless installed on deploy container OR gotenberg sidecar wired.
  - [ ] Bocatas Word template uploaded to the bucket with verified placeholder syntax.
  - [ ] EIPD addendum signed for PDF generation processing activity.

- **Cross-cutting**:
  - [ ] `pnpm check`, `pnpm lint`, `pnpm test` green.
  - [ ] All source files under 400 lines per `CLAUDE.md` §3.

---

## 13. What is explicitly NOT in scope

- OCR of scanned Hojas. Handwriting recognition is unreliable enough that the manual-classify flow already shipped in Phase 1's Uploads tab is the better UX.
- Inbound derivation tracking. Captured via `persons.canal_llegada` today; promoting it to a separate table is a future v2.
- Status workflow on derivations. Adding `pendiente / aceptada / rechazada / completada` requires stakeholder commitment we don't have.
- Time-series trends in the custom-query builder. Templated reports cover the common time-series cases.
- Map at barrio (131-cell) granularity. Distrito (21-cell) is the right resolution for current volume.
- Extension `pg_trgm` move out of `public` schema. Documented as deferred in Phase 2 (security advisor flag); risk of breaking trigram indexes on `persons` warrants its own migration.

---

## 14. Open questions for the reviewer

1. **Sequencing**: agree with Phase 2 → Phase 3, or recommend Phase 3 first based on user value?
2. **PDF stack**: keep LibreOffice in container, or move to gotenberg sidecar from day 1?
3. **K-anonymity floor**: keep at 3 families, or push higher (5)? Should we capture this in the EIPD?
4. **Custom-query builder**: ship in Phase 2, or defer to Phase 2.5 to reduce scope?
5. **Inline `+ Crear institución`**: visible to all admins, or restricted to superadmin to govern catalog quality?
6. **`derivar_audit` table**: add a separate audit trail for intervention create/update events, or rely on `created_by` + `created_at` on the row itself?

---

## 15. Appendix — quick links to source-of-truth artifacts

- Spec: [`docs/superpowers/specs/2026-05-06-programa-familia-5-tab-surface.md`](../specs/2026-05-06-programa-familia-5-tab-surface.md)
- Phase 1 plan (deployed): [`docs/superpowers/plans/2026-05-06-programa-familia-phase1.md`](../plans/2026-05-06-programa-familia-phase1.md)
- Phase 2 plan: [`docs/superpowers/plans/2026-05-06-programa-familia-phase2.md`](../plans/2026-05-06-programa-familia-phase2.md)
- Phase 3 plan: [`docs/superpowers/plans/2026-05-06-programa-familia-phase3.md`](../plans/2026-05-06-programa-familia-phase3.md)
- Project orchestration playbook: [`CLAUDE.md`](../../../CLAUDE.md)
- Architecture notes (auth model, file conventions): [`ARCHITECTURE.md`](../../../ARCHITECTURE.md)
- Original Hoja artifact (Bocatas paper template): supplied by user, not in repo.

---

**End of brief.**
