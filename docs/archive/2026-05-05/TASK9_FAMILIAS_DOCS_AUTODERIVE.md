# Bocatas Digital — Task 9: Familias Documentación Tab — DB-Derived Status + Per-Family AND Per-Member Uploads

**Version:** 1.0 | **Status:** Ready to deploy | **Date:** 2026-04-30  
**Target agent:** Manus IM | **Connectors:** GitHub + Supabase (live EU) + Supabase Storage  
**Prerequisite:** Task 6 complete. `family_member_documents` table exists. `extract-document` Edge Function deployed.  
**Source branch:** fix/familias-docs-autoderive (forked from feature/modal-tabs-batch)  
**Claude planning session:** /Users/familiagirardicavalcante/.claude/plans/activate-using-superpowers-and-karpathy-partitioned-ladybug.md

---

## 1. CONTEXT

Currently, the Documentación tab in `/familias/:id` displays manual toggle switches (Documentos de identidad, Padrón municipal, Justificante de ingresos, Consentimiento Bocatas, Consentimiento Banco de Alimentos) that flip a boolean column in the `families` table directly. These switches have **no underlying file** — a volunteer can mark a doc "as received" without anything actually being stored in Supabase Storage, making the legal compliance audit trail fake. Additionally, the "Carga de Documentos" section hardcodes `["DNI", "Pasaporte", "Comprobante domicilio"]` (generic person-level docs) instead of the families program's actual required document set, and the `DocumentUploadModal` saves only a mock URL with no real file persisted.

**This change fixes all three issues:** document status now auto-derives from real Supabase Storage uploads, scoped to the families program's actual doc requirements; both family-level and per-member documents are tracked with the same audit trail; and every required document, even if deferred at intake, is surfaced as `Pendiente` until the real file is uploaded.

---

## 2. REASONING SUMMARY (key design decisions)

- **Reuse `family_member_documents` with `member_index = -1` sentinel for family-level docs** instead of creating a new `family_documents` table → minimal schema delta; all existing JOIN queries keep working. Rejected: a separate table (would have required parallel RLS, parallel queries, two cache columns).

- **Keep `families.{docs_identidad, padron_recibido, justificante_recibido, consent_bocatas, consent_banco_alimentos, informe_social}` boolean cache columns** instead of deriving status from JOINs everywhere → compliance dashboard hot-path performance; boolean columns are denormalized for speed. Rejected: full live-derive (adds JOIN to every dashboard render, kills LCP budget).

- **Deferred-at-intake placeholders (`documento_url = NULL`)** instead of relaxing the `required` flag → user mandate "the system must remember the obligation forever" — the obligation is NEVER silently dropped; placeholders surface as `Pendiente` until a real file is uploaded. Rejected: removing the deferred option (would make intake impossible when beneficiaries don't have documents present at interview).

- **`is_current` versioning column** added to `family_member_documents` → process PASO 2E.4 mandates yearly `informe_social` renewal per Banco de Alimentos; preserves audit trail when a doc is replaced; avoids losing legal history. Rejected: UPSERT without versioning (silently overwrites old row, breaking audit).

- **`canal_llegada = 'programa_familias'` new enum value** tracks persons created via family intake (vs. independent comedor registration) — informational badge only ("alta vía familia"), NOT a relaxation of any doc requirement. Rejected: hidden flag (transparency is required per EIPD legal docs).

- **Single source of truth `FAMILIA_DOCS_CONFIG` + `FAMILY_DOC_TO_BOOLEAN_COLUMN`** drives UI labels, upload buttons, tRPC enum, DB unique key. One place to change — no duplication across client/server/schema.

---

## 3. FILES CHANGED (grouped by layer)

**Database (migrations):**
- `supabase/migrations/20260430000001_add_canal_llegada_programa_familias.sql` — adds `'programa_familias'` to the `canal_llegada` ENUM (must run standalone before the second migration; `ALTER TYPE … ADD VALUE` is not transactional)
- `supabase/migrations/20260430000002_family_documents_support.sql` — relaxes `member_index` constraint to `>= -1`; adds `is_current BOOLEAN DEFAULT true` column; creates partial UNIQUE indexes for family-level (`member_index = -1`) and per-member (`member_index >= 0`) docs; adds RLS policies for `admin`/`superadmin` only; backfills existing families' boolean cache from EXISTS rules; creates pre-backfill snapshot in `families_pre_backfill_20260430` for rollback

**Shared types:**
- `shared/familyDocuments.ts` (new) — exports `FamilyDocType` ENUM, `FAMILY_DOC_TO_BOOLEAN_COLUMN` map (for server + client), `FAMILY_LEVEL_DOC_TYPES`, `PER_MEMBER_DOC_TYPES` arrays

**Server (tRPC router):**
- `server/routers/families.ts` — added `getFamilyDocuments`, `uploadFamilyDocument`, `deleteFamilyDocument` mutations; replaced broken `getDocumentHistory` and `updateMemberDocument`; added `resolveMemberPersonId` helper (duplicate detection → new person creation with `canal_llegada = 'programa_familias'`); added `ensureFamiliaEnrollment` helper (every member gets a `program_enrollments` row with `programa = 'familia'`); extended `create` mutation to enroll all adult members; added `addMember` mutation

**Client hooks:**
- `client/src/features/families/hooks/useFamilias.ts` — added `useFamilyLevelDocuments`, `useMemberLevelDocuments`, `useAllFamilyDocuments`, `useUploadFamilyDocument`, `useDeleteFamilyDocument`; deleted `useUpdateFamiliaDocField`

**Client UI:**
- `client/src/features/families/constants.ts` — rewrote `FAMILIA_DOCS_CONFIG` from `["DNI","Pasaporte","Comprobante domicilio"]` hardcoded list to 7-entry program-scoped list (4 family-level + 3 per-member); drops `libro_familia` and `dni_titular`
- `client/src/components/DocumentUploadModal.tsx` — real Supabase Storage upload (image compression, 10 MB limit, PDF/JPG/PNG only); typed `useUploadFamilyDocument` (no more `(trpc.families as any)` casts); replaces files via versioning instead of overwriting; shows upload history with soft-delete option
- `client/src/pages/FamiliaDetalle.tsx` — Documentación tab: dropped manual Switches + hardcoded doc list; added `FamilyDocsCard` (4 family-level docs) + `MembersDocsCard` + `MemberDocSubcard` (per member ≥14); status badges (`Subido`/`Pendiente`) instead of Switches; each doc has a "Cargar" button that opens `DocumentUploadModal`; per-member headers link to `/personas/{person_id}`

**Type sync:**
- `client/src/lib/database.types.ts` — updated to include `is_current` BOOLEAN on `family_member_documents` Row/Insert/Update; added `programa_familias` to `canal_llegada` ENUM (auto-updated on next `supabase gen types`)

Cross-reference: design spec at `docs/superpowers/specs/2026-04-15-familias-improvements-design.md` Sections 3–4 (compliance model + per-member structure); this PR implements those sections; Sections 1–2 and 5 (intake flow, i18n templates, case management) are out of scope for this PR.

---

## 4. DEPLOYMENT ORDER (strict sequence — critical)

```bash
# 1. Merge fix/familias-docs-autoderive to main (PR green on tests + code review)
git fetch origin fix/familias-docs-autoderive
git checkout main && git pull origin main
git merge origin/fix/familias-docs-autoderive --no-ff -m "Merge: families docs autoderive (Task 9)"
git push origin main

# 2. Deploy Manus from main (bocatasdg-mvcpdsc2.manus.space auto-rebuilds)
# Manus redeploys automatically on main push; verify in Manus dashboard that the build completes

# 3. Apply migrations in strict order
# The enum-add MUST come first and standalone (not in a transaction)
psql "$DATABASE_URL" -f supabase/migrations/20260430000001_add_canal_llegada_programa_familias.sql
# Verify the enum was added:
psql "$DATABASE_URL" -c "SELECT enum_range(NULL::canal_llegada);"

# Then apply the family documents support migration (includes backfill)
psql "$DATABASE_URL" -f supabase/migrations/20260430000002_family_documents_support.sql

# 4. Verify migration succeeded
psql "$DATABASE_URL" -c "SELECT count(*) FROM families_pre_backfill_20260430;"
# Must be > 0 and equal to current count(families). If 0, the snapshot didn't run — STOP and investigate.

# 5. Create the Supabase Storage bucket (cannot be created via SQL)
# Via Supabase Dashboard: Storage → New bucket → name: family-documents → private (NOT public)
# Then add RLS policies:
#   Policy 1: SELECT — admin, superadmin roles
#   Policy 2: INSERT — admin, superadmin roles
#   Policy 3: UPDATE — admin, superadmin roles
#   Policy 4: DELETE — admin, superadmin roles
# (Reuse the existing policy SQL from the identity-doc bucket as a template)

# 6. Regenerate types (CI step — Manus picks this up on next auto-rebuild)
supabase gen types typescript --local > client/src/lib/database.types.ts
# Verify diff: is_current and programa_familias should now be auto-present
git diff client/src/lib/database.types.ts

# 7. Verify post-deploy on bocatasdg-mvcpdsc2.manus.space
#    - Navigate to /familias/<seed-family-id> Documentación tab
#    - Verify new 4-entry family-level checklist appears (no Switches)
#    - Verify per-member section appears for members ≥14 with 3 per-member docs
#    - Upload a small JPG for "Padrón municipal" → verify badge flips to Subido
#    - Run Lighthouse on the page → LCP should remain ≤ 2.5s on Moto-G profile
```

---

## 5. ROLLBACK PLAN

If post-deploy the compliance counts are wrong (boolean cache inconsistent), or if RLS on the bucket blocks volunteers unexpectedly:

```sql
-- Step 1: Restore the boolean cache to pre-backfill state from snapshot
UPDATE families f SET
  docs_identidad = p.docs_identidad,
  padron_recibido = p.padron_recibido,
  justificante_recibido = p.justificante_recibido,
  consent_bocatas = p.consent_bocatas,
  consent_banco_alimentos = p.consent_banco_alimentos,
  informe_social = p.informe_social,
  informe_social_fecha = p.informe_social_fecha
FROM families_pre_backfill_20260430 p
WHERE f.id = p.id;

-- Step 2: Verify counts are restored
SELECT count(*) FROM families WHERE docs_identidad = true;
-- Compare to pre-migration count (should match)

-- Step 3: Revert the application deployment
-- (Ask Manus to re-deploy from the previous git SHA before this PR)

-- Step 4: RLS bucket policy diagnostic
-- If volunteers are blocked, verify the bucket policy has admin/superadmin roles ALLOWED:
-- SELECT * FROM storage.objects WHERE bucket_id = 'family-documents' LIMIT 1;
-- If the row exists but volunteers still can't read, check the RLS policy SQL (not just the bucket ACL)

-- Note: The `is_current` column and `programa_familias` enum value are forward-compatible — leave them.
-- The snapshot table `families_pre_backfill_20260430` is small (<1 MB typically) and useful for audits — keep it.
```

---

## 6. VERIFICATION CHECKLIST (post-deploy)

**Automated:**
```bash
npm run typecheck && npm run lint && npm test
# All tests must pass; coverage on changed files must be ≥80%
```

**Manual checks on `/familias/<seed-family-id>` → Documentación tab:**

1. **Family-level section** displays exactly 4 documents (Padrón municipal, Justificante de situación, Informe social vigente, Autorización recogida), never the old `["DNI","Pasaporte","Comprobante domicilio"]` triplet.

2. **Per-member section** renders once per member ≥14 years old, each with 3 per-member docs (DNI/NIE/Pasaporte, Consentimiento Bocatas, Consentimiento Banco de Alimentos).

3. Each doc row starts with a status badge (`Pendiente` / `Subido`) — **no Switch is rendered anywhere on this page**.

4. Upload "Padrón municipal" (small JPG) → modal closes → badge auto-flips to `Subido` with a `Ver` link to the real Storage URL.

5. Upload "Documento de identidad" for titular (member 0) as a JPG → `families.docs_identidad` becomes `true` in Supabase. Upload the same doc type for member 1 → `families.docs_identidad` remains `true` (no change, since it's already true). Soft-delete both → boolean returns to `false`.

6. Upload "Informe social" PDF → `families.informe_social = true` AND `informe_social_fecha = today()`.

7. Upload identity doc subtypes in sequence (DNI, then NIE, then pasaporte) for the same member → second upload replaces the first (UNIQUE constraint enforces one row per `(family_id, member_index, documento_tipo, is_current=true)`).

8. **Deferred placeholder flow:** in IntakeWizard, mark "Documento de identidad" for member 1 as `Diferir` → submit → on Documentación tab member 1 shows `Pendiente` (red); the family appears in Compliance Dashboard "documentos pendientes" queue. Later upload via modal → row UPDATEs in place (no duplicate created) → badge flips to `Subido` → removed from pending queue. Boolean cache flips only AFTER the file upload, never on the placeholder row.

9. Compliance Dashboard counts include EVERY required-but-not-uploaded doc as missing — `canal_llegada = 'programa_familias'` badge appears as context near member name but does NOT relax the count.

10. Each member card on Documentación tab links to `/personas/{id}` → opens that person's profile. No orphan members (every member has a `person_id`).

11. RLS: a `voluntario` role attempts to upload via DocumentUploadModal → Storage rejects with 403 Forbidden (expected).

12. Lighthouse on `/familias/<id>` → **LCP ≤ 2.5s** on Moto-G profile (Gate-1 acceptance criterion).

---

## 7. OPEN QUESTIONS / HANDOFF TO LEO

Items requiring stakeholder confirmation before the optional Phase 2 (i18n bilingual consent templates) proceeds, or before rollback is reversed:

1. **`family-documents` bucket RLS — which roles should have access?** Default in this PR: `admin` and `superadmin` only (read, insert, update, delete). Question: should `voluntario` role have SELECT access to view/verify uploads they didn't make? Or DELETE if they uploaded by mistake? Asks: **Espe + Sole**. [This is blocking the expected volunteer UX on the Documentación tab; resolve before signing off.]

2. **Should `informe_social` placeholder block GUF registration?** Default: NO — Bocatas uploads informes asynchronously (Gloria's PDF script or a hand-written PDF uploaded after the family is registered). The system surfaces missing informes via alerts, but does not gate enrollment. Asks: **Espe + Sole**. [If Banco de Alimentos requires it to be present before delivery, change the default.]

3. **Phase 2 — Multilingual consent templates (15–19 bilingual templates per section G of plan)** — full list and Tamazight variant (`shi` Tachelhit vs `tzm` Central Atlas vs `rif` Tarifit vs `kab` Kabyle vs `zgh` Standard Moroccan) pending RGPD lawyer + Espe + Sole confirmation. Tifinagh vs. Latin script also a stakeholder decision. [This is Phase 2; NOT shipped in this PR. CLAUDE.md Gate-1 rule (es/ar/fr/bm only) still applies until Phase 2 confirmation.]

4. **Maghrebi Darija — merge `ary` Moroccan + `arq` Algerian** into a single bilingual template, or keep separate? [Phase 2 decision.]

5. **Manding — merge `mnk` Mandinka + `emk` Maninka** into one bilingual template, or keep separate? [Phase 2 decision.]

---

## 8. REFERENCES

- Bocatas process docs (authoritative): `/Users/familiagirardicavalcante/Desktop/Bocatas_Digital/Bocatas/Docs_TXT/bocatas_procesos_familias_detalle.txt` — PASOS 2A–2E, esp. 2B.4 (consent deferral) and 2E.4 (yearly informe renewal)

- Existing design spec: `docs/superpowers/specs/2026-04-15-familias-improvements-design.md` — Sections 3–4 (compliance model, per-member structure) implemented by this PR

- Claude planning session (full context): `/Users/familiagirardicavalcante/.claude/plans/activate-using-superpowers-and-karpathy-partitioned-ladybug.md` — Sections A–I (schema safety, versioning, concurrency, RLS, i18n caveats, deployment, volunteer-facing changes)

- CLAUDE.md sections invoked:
  - **1.STACK** (Next.js, Zod, Supabase, PowerSync, Chatwoot/n8n)
  - **2.AGENT ORCHESTRATION** (file-level ownership; Schema Agent → Feature Agent → Test Agent → Review Agent → CI)
  - **3.RULES** (architecture: feature-based structure, Zod as source of truth, real device testing, WCAG 2.1 AA, no PII in QR/logs, EIPD non-negotiable, multi-language consent)
  - **7.GUARD RAILS** (no Manual Switches for fake compliance; Spanish-only UI; no auto-import without validation; no PowerSync pre-config)

---

**Manus IM:** Use this document as the source of truth for this task. If deployment order or rollback steps are unclear, escalate to Leo before proceeding.
