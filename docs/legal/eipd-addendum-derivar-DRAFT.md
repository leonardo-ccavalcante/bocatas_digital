# EIPD — Addendum: Programa de Familia — Derivar / Hoja de Registro de Derivaciones e Intervenciones

> **DRAFT for legal review — NOT legal advice.** Prepared by the engineering team to
> describe the new processing activity so the RGPD lawyer (with Sole) can validate,
> complete the risk/legal-basis sections, and sign. This is an **addendum** to the
> existing Bocatas Digital EIPD (Gate 0). Do **not** begin processing real
> beneficiary data through Derivar until this addendum is signed.

| Field | Value |
|---|---|
| Processing activity | Registro de derivaciones e intervenciones (Derivar) within Programa de Familia |
| Status | New activity (Phase 3). Code complete; **not yet activated for real data**. |
| Data controller | Asociación Bocatas |
| Owner of this addendum | Sole (Families Coordinator) + RGPD lawyer |
| Base EIPD | Bocatas Digital EIPD (Gate 0) — this extends it |

## 1. Purpose of the processing
Record **outbound** derivations and interventions for a beneficiary (persona) or
family (familia) within a program, mirroring the paper artifact *"Hoja de Registro de
Derivaciones e Intervenciones"*. Generate the official `.docx`/`.pdf` Hoja for printing
and physical signature. **Outbound only in v1** (no inbound referral tracking; no
status workflow).

## 2. Data subjects
Beneficiaries of Asociación Bocatas — a **vulnerable population** that may include
undocumented migrants, minors (via family members), and people in situations of
social exclusion. This vulnerability is the principal driver of the risk assessment.

## 3. Data categories processed
New tables: `derivacion_hojas`, `derivacion_intervenciones`, `instituciones`,
`tipos_intervencion`.

- **Identification (indirect):** `persona_id` / `familia_id` FK to existing records;
  `profesional_id` / `profesional_nombre` (the staff member). No new direct PII columns
  are added to the persona record.
- **Intervention content (free text):** `descripcion`, `observaciones` — may contain
  **special-category data (Art. 9 GDPR)**: health (`salud`, `salud_mental` intervention
  types), and data revealing **legal/migration status** and social-services situation.
- **Resource referred to:** `institucion_id` + `institucion_snapshot` (jsonb frozen at
  insert: institution name/address/phone/email — not beneficiary PII).
- **Signature artifacts:** `firmado_url` / `firmado_at` (scanned signed Hoja — *deferred
  to v2; not active in v1*).
- **Audit:** `created_by`, `created_at`.

> ⚠️ **Lawyer to confirm:** the free-text `descripcion`/`observaciones` and the health
> intervention types make this **likely Art. 9 special-category processing**, which
> raises the bar for legal basis and safeguards.

## 4. Legal basis (to be confirmed by lawyer)
- **Art. 6 GDPR:** [consent / legitimate interest / public-interest task — lawyer to set].
- **Art. 9 GDPR (special categories):** candidate bases — explicit consent (9.2.a),
  substantial public interest (9.2.g), or social-protection/assistance (9.2.h). Bocatas
  already collects `consent_*` on families/persons; the lawyer should confirm whether the
  existing consent text covers derivation/intervention recording or needs extension.

## 5. Recipients
- **Internal:** admin / superadmin only. Enforced by Postgres RLS on all four tables
  (`get_user_role() IN ('admin','superadmin')`; instituciones read also allows voluntario
  for the inline typeahead, write is admin/superadmin, modify/delete superadmin).
- **External:** the institution a beneficiary is *referred to* (e.g. Médicos del Mundo) —
  this is the derivation itself; lawyer to confirm whether/what beneficiary data is shared
  with the recipient institution and on what basis.
- **No** data sent to third-party processors for this activity. PDF generation is
  server-side (LibreOffice); no external OCR/geocoding.

## 6. Storage, security & retention
- Supabase PostgreSQL (EU region — confirm) with **Row-Level Security** on every table.
- `institucion_snapshot` freezes the resource's contact data at insert so a signed Hoja
  stays accurate even if the institution later changes (data-integrity safeguard).
- **No PII in logs or error messages** (project rule; uses ids only).
- Signed-Hoja uploads (v2) would live in an access-restricted Storage bucket.
- **Retention period: [TO BE DEFINED by Bocatas]** — recommend aligning with the base
  EIPD's retention for beneficiary social records.

## 7. Risks & mitigations
| Risk | Mitigation in the build |
|---|---|
| Re-identification / exposure of legal-migration status → real-world harm (deportation, denial of services) | RLS admin/superadmin-only; no PII in logs; minimal data surfaced in UI; aggregate views not used here |
| Special-category free-text entered without adequate basis | Lawyer to confirm Art. 9 basis + consent coverage **before activation** |
| Historical Hoja shows stale institution data | `institucion_snapshot` jsonb frozen at insert |
| Unauthorized catalog edits | instituciones write = admin/superadmin; modify/delete = superadmin |
| Lack of accountability | `created_by` + `created_at` on intervention rows |
| Signed-document exposure | Upload deferred to v2; bucket RLS to be defined before enabling |

## 8. DPIA necessity (Art. 35)
A DPIA/EIPD addendum is **required**: the processing involves (a) special categories of
data, (b) vulnerable data subjects, and (c) systematic recording at scale. This document
is that addendum; sections 4, 6 (retention), and 7 require the lawyer's completion/sign-off.

## 9. Go-live gate
**Do not enter real beneficiary derivaciones until this addendum is signed.** The code
may be deployed and validated with **test/synthetic data** beforehand; the Derivar tab is
gated by `ENABLED_TABS` (a deliberate manual flip) so real-user activation is a separate,
controllable step.

---
*Engineering references: migrations `20260603000001`–`20260603000004`; routers
`server/routers/{derivar,instituciones,tiposIntervencion}`; UI `client/src/features/derivar`,
`client/src/pages/admin/InstitucionesPage`. Brief: `docs/superpowers/reviews/2026-05-07-phase2-phase3-codex-review.md` §6–§9.*
