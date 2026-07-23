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
  the reason + inline **"Registrar seguimiento"** (opens `FollowUpsPanel`). The
  seguimiento blocked-states apply to RENOVACIONES only — a family with no current
  informe document generates its first informe with just a saved valoración (ADR-0014).
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

## Live local verification (this session — local Supabase, project `repo-informe-valoracion`)

- ✅ **Core render chain VERIFIED live** (`informeGen.live.integration.test.ts`, test 1):
  real titular loaded from `persons` → `buildFamilyDataContext` → `renderDocument`
  with the **published** template → the docx contains the real titular name AND the
  valoración. Proves the whole chain + the dotted-parser fix against real DB + Storage.
- Template published to local `document_templates` (v1, active) via the publish script.
- `supabase db reset` applied cleanly (all migrations + seed). Seed = 1 family / 4
  persons / 2 members / 0 follow-ups.

### 🔴 Finding #2 — the shared `upload_family_document` path is broken in the repo migration state
The persist RPC could NOT run locally. Root causes (all pre-existing, shared with the
EXISTING manual family-doc upload, NOT specific to this feature):
1. Migration `20260506000007_phase2_revoke_public_authenticated_from_secdef.sql`
   `REVOKE EXECUTE … FROM PUBLIC, authenticated` **also stripped `service_role`'s
   PUBLIC-inherited EXECUTE** on `upload_family_document` (and its siblings). Its header
   comment "Application impact: NONE … service_role" is **wrong** — the exact mistake the
   later `20260613000001` migration documents. `has_function_privilege('service_role', …)`
   = **false** after reset. `get_user_role()` is likewise un-executable by app roles.
2. `upload_family_document` guards on `get_user_role() IN ('admin','superadmin')`, but
   `get_user_role()` reads `auth.jwt() -> 'app_metadata' ->> 'role'` — which is `NULL`
   (→ `'beneficiario'`) for a bare **service_role** client. The app calls this RPC via
   `createAdminClient()` (service_role) in `documents.ts`, so the guard **rejects the
   app's own calls** (P0001).
3. `family_member_documents.verified_by` is `UUID REFERENCES auth.users(id)`, but the app
   passes `p_verified_by = String(ctx.user.id)` where `ctx.user.id` is a Manus **int/openId**
   (`drizzle/schema.ts` `users.id = int`) — not a UUID in `auth.users` → `42804`/FK error.
   (Same class as the TES-04 `registrado_por` landmine.)

**These almost certainly break the existing manual family-document upload wherever this
migration/grant state holds** — likely masked in prod only by the known prod↔repo
migration gap. **Recommend: (a) verify manual upload works in prod; (b) fix the shared
path** — grant EXECUTE back to the real caller, make `get_user_role()` handle service_role
(or call the RPC via `createUserImpersonationClient` with an admin JWT), and store a real
UUID (or null) in `verified_by`. Until then, `generateSocialReport` (which reuses this
exact path) will fail the same way. Option: bypass the RPC with a direct versioned insert
via service_role (like `createMemberDocument`) to decouple this feature from the shared bug.

To verify persist locally I applied dev-only shims (grants + a `get_user_role` service_role
branch); these are NOT committed and NOT a substitute for the real fix.

### 🔴 Blocker — local browser login needs Manus OAuth
The app authenticates via the Manus WebDev SDK (`sdk.authenticateRequest`, needs
`OAUTH_SERVER_URL`). With it unset there is no `ctx.user`, so all admin procedures return
UNAUTHORIZED — the UI can be served (running at `http://localhost:3007`) but not exercised
without a Manus OAuth session. The server reads `process.env` directly (it does NOT load
`.env.local`), so server-side env must be exported in the launching shell.

## Pre-PR gate (Leo's requirement — bullet-proof before delivery)
Before opening the PR: `/sat` (Key Assumptions + Devil's Advocacy) · `/code-review` ·
`/karpathy` · `/simplify` · mythos `laquesis`/`cassandra`/`themis`/`diogenes` over the
diff · **`/codex` in a clean context (its rejection = blocker)**. Mirror every touched
CI gate locally (types-drift `--schema public`, migration-filenames, full-repo lint) and
poll `gh pr checks` after push — CI is the truth, local green is a hypothesis. Also QA the
existing informe/nota output given the dotted-parser fix.
