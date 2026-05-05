# EIPD (Evaluación de Impacto de Protección de Datos) — Status & Escalation

> **Phase 6 QA-8 (F-006 / F-03):** CLAUDE.md §3 Compliance non-negotiable:
> "EIPD must exist before any data collection. No exceptions."
>
> The Phase 6 W1-sec audit found NO `docs/legal/EIPD*` file in this repo.
> This file documents the verification path and the escalation procedure.

## Status — to be confirmed by stakeholders (Leo / Nacho / Espe / RGPD lawyer)

- [ ] EIPD document **exists somewhere** (Notion, Google Drive, lawyer's repo, etc.)
- [ ] EIPD document is **current** (last reviewed within the last 12 months)
- [ ] EIPD document **covers all data flows in production today** (persons, families, attendances, deliveries, consents, audit logs, QR payload, OCR documents)
- [ ] A **link or copy** is referenced from this repo for traceability

## Verification (run before any production data collection)

1. **Locate the EIPD.** Ask Leo / RGPD-lawyer-of-record. Likely locations: Bocatas Notion workspace; Google Drive `Asociación Bocatas / Legal / RGPD`; physical file at the asociación office.
2. **Confirm scope.** The document must cover, at minimum:
   - Data controller identity (Asociación Bocatas + contact)
   - Data categories collected (persons, families, attendances, consents, OCR documents, photos)
   - **High-risk fields explicitly named:** `situacion_legal`, `foto_documento_url`, `recorrido_migratorio` (CLAUDE.md §3 RLS-restricted to admin/superadmin)
   - Lawful basis for each data category
   - Retention windows
   - Data subject rights (ARCO + portability) and the channel for exercising them
   - Data processors (Supabase, Manus, Vercel, Chatwoot, n8n, OCR provider)
   - Cross-border transfers (Supabase EU? — verify region)
   - Risk assessment + residual risk acceptance
3. **Cross-reference `audit-no-pii.test.ts`, `qr-no-pii.test.ts`, `log-no-pii.test.ts`** which encode the technical guard-rails. The EIPD should reference these tests as the implementation of its "technical measures" section.
4. **Once located, link from `docs/legal/EIPD-link.md`** with: name + version + last-review date + access path.

## Escalation procedure if EIPD does NOT exist or is out-of-date

**This is a Gate-1 launch-blocking issue per CLAUDE.md.** Production data collection cannot start without it.

1. **Stop the deployment clock.** Notify Leo immediately. Do not enable production data ingestion (do not point production at a Supabase project that real beneficiaries write to).
2. **Engage the RGPD lawyer.** Contracted via Asociación Bocatas; budget line in Phase 0 of `BUDGET.md`.
3. **Reference these as inputs to the EIPD draft:**
   - `CLAUDE.md` §3 Compliance section (the technical guard-rails)
   - `supabase/migrations/EXPORTED/` for the schema's PII surface
   - `docs/superpowers/findings/2026-05-06-consolidated.md` for the audit baseline
   - `server/__tests__/audit-no-pii.test.ts` + `qr-no-pii.test.ts` + `log-no-pii.test.ts` as evidence of "no-PII-leak" technical measures
   - `consent_templates` rows (Spanish, Arabic, French, Bambara — see migration `20260506000009_seed_consent_es.sql` for QA-1D)
4. **Document the resolution.** Once the EIPD is signed and current, update this file with the link, and remove the F-006 entry from `docs/superpowers/findings/2026-05-06-consolidated.md`.

## Code-side maintenance hooks

These are already in place; if you change them, update the EIPD.

| Guard-rail | Code location | Test |
|---|---|---|
| No PII in QR codes | `shared/qr/payload.ts` + `client/src/features/persons/components/QRCodeCard.tsx` | `server/__tests__/qr-no-pii.test.ts` |
| No PII in audit logs | `server/routers/admin.ts` + `logAudit()` | `server/__tests__/audit-no-pii.test.ts` |
| No PII in console logs | server-wide convention | `server/__tests__/log-no-pii.test.ts` (added in QA-9) |
| RLS for high-risk fields | DB-side RLS policies + app-layer column-list gate | `server/__tests__/persons-getall-rls.test.ts` (QA-1C) |
| Group A consent mandatory | `server/routers/persons/consents.ts:69-85` | `server/__tests__/consent-group-a-enforcement.test.ts` (QA-9) |
| Multi-language consent (es/ar/fr/bm) | `supabase/migrations/EXPORTED/20260413121730_*.sql` + `supabase/migrations/20260506000009_seed_consent_es.sql` | `server/__tests__/consent-seed-multilang.test.ts` (QA-1D) |

## Owner

- **Code-side:** Schema Agent (per CLAUDE.md §2 swim lanes) — owns this runbook.
- **Legal-side:** Leo + RGPD lawyer-of-record.
- **Review cadence:** Annual or whenever a new data category is added to the schema.
