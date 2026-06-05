# Handoff — Legacy "Programa de Familia" importer: Phases 3–5 + follow-ups

**Date:** 2026-06-05 · **For:** a fresh conversation that forks and continues this work.
**Companion plan (full history + decisions):** `~/.claude/plans/ok-now-we-have-sunny-pizza.md`
**Project memory:** `project-bocatas-legacy-familias-import-hardening` (in the auto-memory dir).

---

## 0. TL;DR

Ingest TWO legacy GUF spreadsheets into `families`/`persons`/`familia_miembros`:
- **ROSTER** `LISTADO …(aqui los datos).csv` — long, 1 row/person, 54 cols, ~4,015 rows / 1,475 families. Builds the families.
- **INFORMES** `LISTADO …INFORMES SOCIALES (no tocar).csv` — wide, 1 row/family, 79 cols, same 1,475 families. **Enriches** them (narrative + titular/member backfill).

**DONE + reviewed + committed** (this is a hard checkpoint): Phase 1 (roster robustness), B1 (RGPD dedup fix), Phase 2 (roster extra fields), INFORMES enrich importer (v1 narrative+titular, 2b member backfill). Two independent reviews (code + RGPD/security) passed with all findings fixed + verified on a live Dockerized Supabase.

**REMAINING (this handoff):** Phase 3 (repeatable upsert), Phase 4 (UI), Phase 5 (best-effort placeholders), test/RGPD follow-ups.

---

## 1. ⚠️ FIRST THING: rebase onto current origin/main

The branch `feat/harden-legacy-familias` forked at `249cc80`. **`origin/main` has since advanced to `22050db`** (3 commits: PR #68 reparto-e5 + "Harden person privacy and consent handling" + "Fix CI test expectations for protected person reads").

- `git diff --name-only 249cc80..origin/main` vs my commits → **NO file overlap**, so the rebase should be **conflict-free**.
- BUT the upstream "person privacy / protected reads" work may interact at runtime with this branch's narrative redaction (`redactHighRiskFields`) and the person-read paths. **After rebasing, re-run `supabase db reset` + the full importer suite + the live-DB integration checks** before continuing.

```
git fetch origin main
git rebase origin/main        # expect clean; if conflicts, they're new (re-verify)
# then re-verify (section 3)
```

---

## 2. What exists (committed: 120d0c6 "core", 8397d8b "2b + review fixes")

Pure mappers/parsers (server/, ≥95% unit-tested):
- `server/csvLegacyFamiliasParser.ts` — whole-doc quote-aware parse (G2), header-NAME resolver for the 54-col shape (G1/R1), `repairMojibake` idempotent guard (G4), `fieldsToLegacyRow`, `REQUIRED_KEYS`.
- `server/csvLegacyFamiliasDictionaries.ts` — MONTHS, 128-country, parentesco, colectivo lookups (built from the real distinct values).
- `server/csvLegacyFamiliasMapper.ts` — `parseDate` v2 (Spanish months / 2-digit pivot / Excel serials / junk), `parseCountry`, `parseParentesco`, `parseEstado`, `parseCodigoPostal` (B3), `parseRow`.
- `server/csvInformesParser.ts` — un-pivots the wide INFORMES sheet (titular + narrative + member slots 2–14), typo-tolerant.
- `server/csvInformesMatch.ts` — **safety-critical** family-scoped member matcher (DNI → name+DOB → first-surname tiers; refuse-on-ambiguity; never name-only; no member reuse).

Routers (server/routers/families/):
- `legacy-import.ts` — `previewLegacyImport` / `confirmLegacyImport` (roster).
- `informes-import.ts` — `previewInformesImport` / `confirmInformesImport` (enrich); mounted in `index.ts`.

Contract: `shared/legacyFamiliasTypes.ts` (LegacyRow/CleanRow/FamilyGroup + Informes* + MemberMatch). Redaction: `server/_core/rlsRedaction.ts` (narrative cols added to HIGH_RISK_FIELDS).

Migrations (all applied + verified locally; **manual Supabase Cloud apply for prod**):
- `20260604000001` — dedup by document only (B1) + persons.codigo_postal.
- `20260604000002` — `confirm_legacy_familias_import` v2: writes families.estado / num_* / codigo_postal; returns `error_details`.
- `20260604000003` — families.`situacion_familiar_texto` + `necesidades_texto` (admin-only) + audit ops `enriched`/`skipped_missing`.
- `20260604000004` — `enrich_families_from_informes` (backfill-only; narrative-when-empty; titular + member COALESCE backfill; **member auto-write only on strong tiers documento/probe_key**).

Tests: `csvLegacyFamilias*.test.ts`, `csvInformes*.test.ts`, `routers/families/__tests__/legacy-import*.test.ts`. **184 importer unit tests; typecheck 0; lint 0.** Committed synthetic fixture `tests/fixtures/legacy-familias-edgecases.csv`.

**Real-data state (validated locally, PII-safe):** roster → 1,469 families, 1 unknown country, 7 bad dates of 3,898 rows; INFORMES → 2,455 members un-pivoted.

---

## 3. Environment for the new conversation (Docker tier-2)

`config.toml` is **NOT committed** (per-dev). The other repo worktrees may run Supabase on the default 543xx ports.

```
cd <worktree on feat/harden-legacy-familias, rebased>
corepack pnpm install
npx supabase init                       # creates supabase/config.toml (gitignored)
# If 543xx ports are busy (another worktree's stack): remap config.toml to a free
# range (this branch used 555xx) and disable studio/inbucket/analytics/edge_runtime
# (keep db + auth + storage + realtime — storage/realtime have migration schema deps).
npx supabase start
npx supabase db reset                   # applies all migrations incl. 20260604000001-04
corepack pnpm exec vitest run server/csvLegacyFamilias*.test.ts server/csvInformes*.test.ts \
  server/routers/families/__tests__/legacy-import.test.ts
corepack pnpm check && corepack pnpm exec eslint server/csvInformes* server/csvLegacyFamilias*
```

- `psql` is not on PATH — query via `docker exec -i supabase_db_<project> psql -U postgres -d postgres`.
- Admin-context SQL test pattern: `SET request.jwt.claims = '{"sub":"<uuid>","app_metadata":{"role":"admin"}}';` then insert a `bulk_import_previews` row with `created_by = <uuid>` and call the RPC.
- Real CSVs (live PII — local only, never commit): `~/Downloads/LISTADO …(aqui los datos).csv` (roster) and `<repo root>/LISTADO …INFORMES SOCIALES (no tocar).csv`. Gitignored local validators: `scripts/_validate-legacy-real.ts`, `scripts/_validate-informes-real.ts`.

---

## 4. Phase 3 — Roster repeatable upsert (skip / update)

**Goal:** make the roster importer a repeatable channel (currently first-load only; `confirm_legacy_familias_import` SKIPS existing `legacy_numero`).

Steps:
1. **Migration** `confirm_legacy_familias_import` v3 — add `p_mode text DEFAULT 'skip'`. `skip` = current behavior. `update` = on existing `legacy_numero`: UPDATE families estado/num_*/codigo_postal/metadata; upsert changed person fields (COALESCE-or-overwrite per a decided policy — confirm with Leo whether update OVERWRITES or backfills); add newly-appearing members. Keep savepoints, audit (add `updated` op to the CHECK), `sanitize_audit_error`, role gate, JWT impersonation.
2. **Contract/router** — thread `p_mode` through `confirmLegacyImport` input; the modal's "actualizar familias existentes" toggle (Phase 4) sets it.
3. **Decide with Leo:** does `update` overwrite non-empty roster fields or only backfill? (INFORMES enrich is backfill-only; roster re-sync may want overwrite for the operational fields it owns — estado, counts, GUF flags.) Default recommendation: overwrite the family-level operational fields (estado/num_*/GUF), backfill person fields.
4. **Gate:** TDD + live-DB integration (re-run import with `skip` → all skipped; with `update` → fields updated, new members added, idempotent on a second `update` run). + code-review/receiving + verification.
5. Regenerate `client/src/lib/database.types.ts` (`supabase gen types typescript --local`).

Also consider (To-confirm with Leo, from the plan): enroll legacy titular/members in the `familia` program for analytics parity (intake path does this via `ensureFamiliaEnrollment`; the legacy RPC does not).

---

## 5. Phase 4 — UI (two-lane import modal)

**File:** `client/src/components/BulkImportFamiliasLegacyModal.tsx` (+ `hooks/useFamilias.ts`).

1. **Two lanes / file-type selector** — Roster import (existing preview→confirm) and a NEW INFORMES enrich lane calling `previewInformesImport`/`confirmInformesImport`.
2. **Roster preview deltas** — render new warning codes (`estado_unknown`, `cp_invalid`, `date_ambiguous`), show per-family `estado`, add the **"actualizar familias existentes" (merge/update)** toggle → `p_mode` (Phase 3).
3. **INFORMES preview UI** — buckets: `families_to_enrich` / `family_missing` / `warning_families`; per-family member-match summary (matched / `member_unmatched` / `ambiguous` / `name_first_apellido` = needs-confirm); narrative present indicator.
4. **Member-match confirmation (the deferred surface)** — `name_first_apellido` matches are flag-only in the RPC (no auto-write). The UI should let an admin CONFIRM a weak match → which would upgrade it to write. (Decide the mechanism with Leo; until then they simply don't write.)
5. **Gate:** WCAG 2.1 AA (semantic HTML, ARIA, ≥4.5:1, no text-only state), `/benchmark` (Lighthouse LCP ≤2.5s, bundle ≤300KB), and the modal runtime QA (Gate D — drive both lanes end-to-end against the Docker DB, assert real rows + audit). Spanish-only UI (chrome).

---

## 6. Phase 5 — Best-effort policy (G9)

Relax missing `nombre`/`apellidos` from hard parse-errors to **warnings + placeholder** (`(sin nombre)`) so a family/member isn't lost; keep empty `numero_familia` a hard error. Surface in the preview flagged buckets. **Confirm placeholder policy with Leo.** Files: `csvLegacyFamiliasMapper.ts` `parseRow` (the nombre/apellidos guards), `csvInformesParser.ts` (member nombre guard), + a new warning code. Gate: TDD + verification. (On the real roster this recovers ~39 rows currently rejected: nombre 15 + apellidos 24.)

---

## 7. Follow-ups (from the review)

- **M-1 (do early):** a COMMITTED env-gated integration test for `confirm_legacy_familias_import` v2 + `enrich_families_from_informes` (the RPCs are currently proven via direct SQL only). Pattern: `server/__tests__/confirm-legacy-import-rpc.test.ts` (env-gated, runs against local Supabase). Add an enrich equivalent.
- **LOW-4:** the roster preview's `person_dedup_hits` still uses the name+DOB key, weaker than the now-document-only merge → can mislead the operator. Recompute/relabel (or drop) in `legacy-import.ts`; UI copy in Phase 4.
- **Member-conflict classification (from MEDIUM-2 / review):** when an INFORMES member matches a roster member by name but DIFFERENT DOB/DNI, classify as `member_conflict` (probable same-person discrepancy) rather than silently `none` — surface for adjudication. Lives in `csvInformesMatch.ts` + preview counts.

---

## 8. RGPD go-live gates (Leo / not dev blockers, but block prod import)

- **EIPD addendum** covering the Art. 9 social-report narrative (`situacion_familiar_texto`/`necesidades_texto`) — same pattern as the PostHog session-replay gate. **Do not import INFORMES narrative to prod until signed.**
- **`bulk_import_previews` purge job** — the stash is plaintext with no TTL-purge job (TTL is query-time only); add a cron/delete-stale before prod carries Art. 9 text.
- Confirm `notas_informe_social` + the narrative at rest in the stash are covered by the EIPD.

---

## 9. Process to follow (the Phase Gate)

Per phase, before advancing: **A** `/test-driven-development` (RED→GREEN→IMPROVE; the two CSVs as golden fixtures) · **B** `/requesting-code-review` + a security/RGPD review (mandatory for PII/RPC/RLS) → resolve via `/receiving-code-review` · **C** `/verification-before-completion` (paste `pnpm check && pnpm test && pnpm lint` output; ci-types-drift / ci-migration-filenames / ci-supabase-advisors) · **D** `/qa` runtime (modal end-to-end vs Docker DB). DB phases also run the staged **Prod test review** (backup/GUF-export → Docker dry-run → ~5-family canary on prod `vqvgcsdvvgyubqxumlwn` → full → rollback by `legacy_numero` soft-delete). **No CI/CD deploy** — migrations are manual Cloud applies coordinated with Leo; app ships via Manus.

---

## 10. Pointers

- Prod Supabase project: `vqvgcsdvvgyubqxumlwn` (verify parity; avoid scratch `whgzqacbbxaxwbkvzdij`).
- Run `codemap --diff --ref origin/main` in the worktree for the live change map.
- Branch: `feat/harden-legacy-familias` @ `8397d8b` (rebase onto `origin/main` first — section 1).
