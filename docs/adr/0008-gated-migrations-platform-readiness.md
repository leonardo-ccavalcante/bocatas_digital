# ADR-0008 — Legally-gated migrations apply for platform readiness; signoff is a go-live gate

- **Status:** Accepted (2026-06-12, Leo)
- **Deciders:** Leo (Product/Tech Lead)
- **Context source:** Mythos audit finding TES-02; verified live against prod (`vqvgcsdvvgyubqxumlwn`, read-only).

## Context

Several migrations under `supabase/migrations/` carried a top-of-file directive
`PENDING REVIEW — DO NOT APPLY WITHOUT <RGPD LAWYER SIGNOFF | EIPD UPDATE>`. The
directive was **inert**: it is a SQL comment, so `supabase db reset` and CI apply the
DDL regardless (TES-02). The application code already depends on the artifacts these
migrations create — e.g. `server/routers/entregas/signature.ts` uploads to the
`firmas-entregas` bucket and inserts into `delivery_signature_audit`;
`server/familyEvents.ts` inserts into `family_webhook_log`.

Verified prod reality (read-only):

| Migration | In prod | Rows | Note |
|---|---|---|---|
| `20260509000001_delivery_signature_audit` | applied | 0 | schema present, no signature evidence yet |
| `20260509000002_firmas_entregas_storage_rls` | applied | — | bucket lockdown present |
| `20260512000001_create_family_webhook_log` | applied | 0 | schema present, no webhook logs yet |

So the markers told a falsehood ("do not apply") about migrations that *are* applied,
and the legal signoff they gated on was being tracked only as a comment the build
ignores.

The platform needs these tables and the signature/webhook features wired **before**
the RGPD lawyer can review a working system — you cannot ask for signoff on something
that does not exist yet.

## Decision

**The RGPD-lawyer / EIPD signoff is a GO-LIVE gate on collecting production data into
these tables — it is NOT a migration or build blocker.** The legally-gated migrations
**apply** as part of platform readiness. The per-migration legal requirements are
preserved verbatim, reframed from "WHY THIS IS NOT APPLIED YET" into a
"GO-LIVE COMPLIANCE CHECKLIST" that must clear **before production data is collected**
in each table, tracked in the EIPD register.

**In scope (markers reframed to truthful go-live notes):**
`delivery_signature_audit`, `firmas_entregas_storage_rls`, `family_webhook_log`.

**Out of scope (different gate, marker left intact):**
- `20260511000001_add_padron_fecha` — gated on Espe/Sole 180-day-cadence signoff, not
  the lawyer. Not in prod; revisit with the stakeholders (also a prod/repo divergence).
- `20260508000000`/`20260508000001_high_risk_fields_rls` — issue #50 (RLS-in-DB is
  deliberately non-functional app-wide; `redactHighRiskFields` is the boundary).
- `20260513000001_alter_consent_language_enum_template` — gated on the population-
  threshold query (B.5.1), a data-driven decision, not the lawyer.

## Consequences

- **Positive:** the markers stop lying; the build and prod agree (these migrations
  apply); the compliance requirements become an actionable pre-go-live checklist
  instead of a comment the tooling ignores; the platform is review-ready for counsel.
- **Obligation retained:** before signature/webhook features collect **production**
  data, the listed checklist items (lawyer legal-equivalence signoff, EIPD processing-
  record update, retention/salt policy) must be cleared and recorded in the EIPD. The
  reframed migration headers carry the full checklist.
- **No schema change:** this ADR + the marker reframes are comments-only; `db reset`
  output is unchanged (the migrations already applied).
- **Not a blanket policy:** migrations gated on non-legal reviewers (stakeholder
  cadence, threshold queries, issue #50) keep their markers and are decided separately.
