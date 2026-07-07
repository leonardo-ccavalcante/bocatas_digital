# Handoff — Informe de Valoración Social Familia

Branch: `feat/informe-valoracion-social` (off `origin/main` @ 2b6cc40).
Commits: `45f6e2f` (template + composer + context), `9a560d8` (persist + bulk + eligibility + narrative).

## What is DONE and VERIFIED (no DB needed)

| Area | File(s) | Proof |
|------|---------|-------|
| Official template → docxtemplater (member loop) | `server/services/__fixtures__/informe-valoracion-social.docx` (+ `scratchpad/convert_template.py`) | golden test: every field fills; 0/1/6/12 members render exactly N rows |
| **Latent bug fix** (see below) | `server/services/documentService.ts` (`dottedParser`) | golden test + existing determinism/renderFailure stay green |
| Narrative composer (the "merge") | `server/services/narrativeComposer.ts` | `narrativeComposer.test.ts` (5) |
| Context builder fed all fields | `server/services/documentContextBuilder.ts`, `documentService.types.ts` | `documentContextBuilder.test.ts` (17) |
| Eligibility ladder (bulk correctness) | `server/services/informeEligibility.ts` | `informeEligibility.test.ts` (9) |
| New documento_tipo | `shared/familyDocuments.ts` | tsc |

**50 tests green · `tsc --noEmit` clean · eslint clean.**

## 🔴 Latent production bug fixed here (report to Leo)

docxtemplater's DEFAULT parser does **not** resolve dotted tags (`{titular.nombre}`).
The existing `document_templates` for **informe_social AND nota_entrega** use dotted
tags, so **every generated informe/nota has been rendering the titular's
nombre/DNI/teléfono and familia.numero BLANK in production**. The determinism test
could never catch it (two equally-blank renders are byte-identical; no content test
existed). Fixed by adding `parser: dottedParser` to `renderDocument`. This fix ships
with this branch and repairs the existing documents too — **worth a separate note /
QA on the current informe/nota output.**

## DONE but NOT runtime-verified (needs a live Supabase — Docker was down)

- `documents-gen.ts`: `generateSocialReport`, `bulkPreviewSocialReports`, `bulkGenerateChunk`
- `informeBulkData.ts`: `fetchActiveFamiliesReadiness` (batched)
- `narrative.ts`: `composeNarrativeDraft`, `updateNarrative`
These typecheck + follow the exact `upload_family_document` / storage patterns, but the
DB/storage round-trips and the batched query grouping need integration verification.

## STILL TODO

### 1. Publish the template (one-time, per environment)
The fixture `.docx` IS the production template. Publish it as the active
`informe_social` template (supersedes the old one that caused the blank-titular bug):

1. Upload `server/services/__fixtures__/informe-valoracion-social.docx` to Storage
   bucket **`document-templates`** (e.g. path `informe-valoracion-social.docx`).
2. Insert an active `document_templates` row (via `templateEditorRouter.publishTemplate`
   or SQL) with:
   - `slug = 'informe_social'`, `is_active = true` (deactivate the prior active row),
   - `storage_path` = the uploaded path, `mime` = docx,
   - `placeholders = ['titular.nombre','titular.apellidos','titular.documento','familia.numero','valoracion']`
     (only always-present required scalars; optional pais/direccion/fecha_nacimiento
     intentionally omitted → blank via nullGetter instead of failing).
3. Re-run the golden test against the PUBLISHED row (integration) to confirm parity.

### 2. Wire generated informe into the program-wide document list (optional)
`family_member_documents.tipo_id` must be set for `listAllForProgram` to surface it.
Seed a `program_document_types` row (`programa_familias`, `informe_valoracion_social`)
and set `tipo_id` on insert (extend the RPC or a follow-up UPDATE). Per-family "Ver
informe generado" works without this (reads by family_id + tipo).

### 3. UI (3 surfaces — build with the browser + `/design-review`; WCAG AA, color+icon, mobile-first)
- **`SocialReportPanel.tsx`** — add a "Valoración social" block: `<Textarea>` bound to
  `family.situacion_familiar_texto`; **"Componer borrador"** → `families.composeNarrativeDraft`
  (pre-fill textarea; confirm before overwriting non-empty); **"Guardar"** →
  `families.updateNarrative`. Change the generate button to call
  `families.generateSocialReport` (persist) and add a **"Ver informe generado"**
  link (signed URL of the current `informe_valoracion_social` doc). When blocked, show
  the reason + inline **"Registrar seguimiento"** (opens `FollowUpsPanel`).
- **`GenerateDocumentButton.tsx`** — add `persist?: boolean`; when set, call
  `generateSocialReport` and toast "Informe guardado" instead of the base64 download.
- **`FamiliasInformesSociales.tsx`** — "Generar/actualizar informes de todas las familias
  activas" → `bulkPreviewSocialReports` (show `counts` + skip list grouped by `label`) →
  loop the `ready` ids in chunks of ≤25 through `bulkGenerateChunk` with a `<Progress>`
  bar (aria-live) → final generated/skipped/failed summary.

### 4. Migrations / compliance
- No schema migration is required (reused `situacion_familiar_texto`; new tipo is
  app-side only).
- **GO-LIVE GATE:** the composed narrative + persisted docx are Art.9 special-category
  data → the **EIPD addendum (migration `20260604000003`) must be signed before prod**.
  Voluntarios must never receive the narrative column nor a signed URL to the docx.

## Pre-PR gate (Leo's requirement — bullet-proof before delivery)
Before opening the PR: `/sat` (Key Assumptions + Devil's Advocacy) · `/code-review` ·
`/karpathy` · `/simplify` · mythos `laquesis`/`cassandra`/`themis`/`diogenes` over the
diff · **`/codex` in a clean context (its rejection = blocker)**. Mirror every touched
CI gate locally (types-drift `--schema public`, migration-filenames, full-repo lint) and
poll `gh pr checks` after push — CI is the truth, local green is a hypothesis. Also QA the
existing informe/nota output given the dotted-parser fix.
