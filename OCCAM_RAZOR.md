# Bocatas Digital — Scope Discipline (Occam's Razor)

> This document applies the parsimony principle to Bocatas Digital.
> For every feature NOT in the current gate: the reason it was cut is documented here.
> New contributors should read this before proposing scope additions.

---

## Core Principle

**Build the minimum system that solves the highest-frequency problem for the most vulnerable users.**

Every feature must pass this test before being added:
1. **Evidence test:** Is there documented evidence this is needed now (not eventually)?
2. **Dependency test:** Does anything else block this feature? If yes, defer it.
3. **Complexity penalty:** Does adding this feature increase system complexity beyond what the evidence justifies?

If any answer is "no" or "unclear" → defer to the appropriate gate.

---

## What Is Built (and Why It Earned Its Place)

| Feature | Evidence it belongs in Gate 1 |
|---------|-------------------------------|
| QR check-in | Daily operation. Cardboard punch is the #1 friction point for volunteers. |
| Person registration wizard | Required to generate QR cards. No digital identity = no digital check-in. |
| Duplicate detection | 4,000 people/year means duplicates are inevitable without it. |
| Digital consent (bilingual) | RGPD legal requirement. Cannot collect data without it. |
| Offline queue | Field conditions at Sede Ópera and La Cañada have unstable connectivity. |
| RBAC (4 roles) | Volunteers must not access sensitive social data. Legal and safety requirement. |
| RLS on all tables | EIPD mandates row-level data isolation. Not optional. |

---

## What Is NOT Built in Gate 1 (and Why)

### OCR document scanner
**Cut because:** Requires testing on real NIE, Syrian ID, CNIE originals in field conditions. Failure rate on damaged/multilingual documents is unknown. Manual fallback always exists. → Gate 2.

### 4-language UI (Arabic, French, Bambara)
**Cut because:** i18n infrastructure is installed (next-intl). Translations require review by native speakers from the beneficiary community. Launching untranslated is better than launching wrong translations. → Gate 2.

### Families program (GUF integration)
**Cut because:** GUF has no API — only CSV export. Import strategy must be validated with Espe before any code is written. Data loss risk: GUF deletions are non-recoverable. → Gate 2.

### WhatsApp / email sending from Next.js
**Cut because:** This layer belongs to Chatwoot + n8n on VPS. Bocatas Digital emits events; Chatwoot handles delivery. Building this in Next.js would duplicate infrastructure and violate the service boundary.

### Case management
**Cut because:** Zero operational usage until Gate 1 (comedor) is stable. Adding case records before person records are clean creates orphaned data.

### Volunteer database
**Cut because:** Volunteers currently use WhatsApp. Digital volunteer management is a Gate 3 problem and depends on the persons schema being stable.

### PowerSync (full offline)
**Cut because:** Full offline sync requires a stable schema. Schema stability is achieved at end of Gate 1. Premature PowerSync configuration would require re-configuration after every schema change.

### Grant tracking
**Cut because:** Funders currently accept manual reports. Automating grant tracking before attendance data is clean produces wrong numbers. → Gate 4.

---

## Entity Count Check (Parsimony Lens 1)

The current Gate 1 schema has **12 tables**:
`persons`, `locations`, `attendances`, `program_enrollments`, `programs`, `consents`, `consent_templates`, `families`, `courses`, `volunteers`, `grants`, `deliveries`

The last 5 (`families`, `courses`, `volunteers`, `grants`, `deliveries`) are **stub tables** — they exist in the schema to reserve the namespace and prevent future migrations from conflicting. They have no RLS policies and no application code yet.

This is intentional: the stub tables are the minimum entity count needed to make the schema forward-compatible without implementing the full feature.

---

## Assumption Count Check (Parsimony Lens 2)

The project carries **5 documented assumptions** (see `PROBLEM_SOLVING.md`). Each assumption was kept because:
- It directly affects a Gate 1 architectural decision
- Removing it would leave a decision unexplained

No decorative assumptions are carried. If an assumption doesn't change a decision, it's not in the list.

---

## The Simplicity Trap — When NOT to Cut (Parsimony Lens 3)

Some things that *look* like over-engineering are actually necessary:

| Looks complex | Why it's necessary |
|---------------|-------------------|
| XState for check-in | 8 states with auto-reset timers and offline branching. A simple `useState` would require re-implementing the same state transitions ad hoc — and they would drift. |
| Zod schemas for every feature | RGPD requires validated, auditable data at every insert. Schema validation is not optional at a boundary that touches PII. |
| RLS on all tables | Not every table needs it today, but adding RLS after data exists is a migration with legal risk. Adding it now costs nothing in production. |
| WCAG 2.1 AA on all UI | Beneficiaries include elderly, low-literacy, and non-Spanish speakers. Retrofitting accessibility is 10× more expensive than building it in. |
| Consent in 4 languages | Group A consent (RGPD mandatory) must be in the beneficiary's primary language from day 1. This is a legal requirement, not a feature. |
