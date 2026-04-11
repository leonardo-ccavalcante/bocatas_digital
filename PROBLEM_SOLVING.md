# Bocatas Digital — Problem-Solving Analysis

> Structured breakdown of why this platform exists, what it solves, and how decisions are prioritised.
> Framework: Issue Tree (MECE) + Stakeholder mapping + Gate prioritisation.

---

## Problem Statement

**Asociación Bocatas** serves 4,000+ vulnerable people per year in Madrid across 9 operational programs.
Their current operations depend on **6 fragmented systems** that cannot talk to each other:

| System | Used for | Problem |
|--------|----------|---------|
| Notion | Case notes | Not accessible on mobile; volunteers can't update in the field |
| Excel | Attendance tracking | Manual, no real-time data, error-prone |
| Cardboard punch card | Daily comedor check-in | ~30s per person, no digital record |
| Google Sheets | Families program tracking | Disconnected from attendance |
| GUF portal | Banco de Alimentos family data | No API, CSV-only, non-recoverable deletions |
| Paper files + WhatsApp | Registration, consent, communication | RGPD violation risk, no audit trail |

**Root cause:** There is no single unified digital record per person. Each system holds a fragment.  
**Consequence:** Coordinators cannot answer "how many people did we serve this month?" in under an hour.  
**North Star Metric:** Personas registradas con al menos 1 check-in digital en los últimos 30 días.

---

## Stakeholder Map

| Person | Role | Primary pain | Success signal |
|--------|------|-------------|----------------|
| Nacho / Espe | Bocatas coordinators | Can't get real-time attendance data | Dashboard shows today's count < 1 min |
| Sole | Families program coordinator | Manages GUF + WhatsApp manually | Families program data in one place |
| Volunteers (10–15) | Daily check-in operators | Cardboard punch is slow and error-prone | QR check-in < 8s on real device |
| Leo | Product/Tech Lead | Coordinating 6 fragmented systems | All systems replaced by Gate 2 |
| Beneficiaries (4,000+) | People served | No digital profile, consent unclear | Profile created, consent recorded in their language |

---

## Issue Tree — What Must Be Built (MECE)

```
Bocatas Digital Platform
│
├── FOUNDATION (Gate 0 — complete)
│   ├── Schema: persons, attendances, locations, programs, consents, families (stubs)
│   ├── RBAC: 4 roles — superadmin, admin, voluntario, beneficiario
│   ├── RLS: row-level security per role per table
│   ├── EIPD: legal data protection impact assessment (with RGPD lawyer)
│   └── Dev environment: Supabase local + Vite scaffold + CI/CD
│
├── COMEDOR MVP (Gate 1 — in progress)
│   ├── Epic A: Person Registration + QR
│   │   ├── 7-step registration wizard (< 5 min per person)
│   │   ├── Duplicate detection (fuzzy name match)
│   │   ├── Digital consent (Spanish + beneficiary's primary language)
│   │   └── QR card (UUID only — no PII in QR)
│   ├── Epic B: QR Check-in (replaces cardboard punch)
│   │   ├── XState machine: idle → scanning → verifying → result
│   │   ├── Visual feedback: green / amber / red (no text dependency)
│   │   ├── Manual fallback: name search < 2s
│   │   └── Offline queue: check-ins persist locally, sync on reconnect
│   └── Epic C: Dashboard
│       ├── KPI cards: today / this week / this month
│       ├── Trend chart: last 4 weeks (lightweight, no heavy libs)
│       └── CSV export (anonymised)
│
├── FAMILIES PROGRAM (Gate 2 — deferred)
│   ├── GUF CSV import
│   ├── Family member management
│   └── Delivery signature (legally equivalent to paper)
│
├── COURSES + VOLUNTEERING (Gate 3 — deferred)
├── CASE MANAGEMENT (Gate 4 — deferred)
└── INTEROPERABILITY (Gate 5 — deferred)
```

---

## Prioritisation Logic

Gate 1 was chosen as the first live release because:

1. **Highest daily frequency:** The comedor operates daily. A fix here has the highest daily impact.
2. **Fastest ROI:** Replacing the cardboard punch card is a single behaviour change for volunteers.
3. **Least dependencies:** Does not require GUF integration, legal sign-off on digital signatures, or OCR.
4. **Measurable:** The north star metric (digital check-ins) is directly unlocked by Gate 1.

**Gate 1 acceptance criteria (Definition of Done):**

| Metric | Target |
|--------|--------|
| QR check-in end-to-end | < 8 seconds on real device |
| New person registration | < 5 minutes |
| "How many today?" answer | < 1 minute (real-time dashboard) |
| Failed QR scan rate | < 5% |
| LCP on Moto G4 throttled 4G | ≤ 2.5s |

---

## Key Assumptions (SAT Stress-Test)

These are the assumptions the project depends on. If any proves wrong, it triggers a design review.

| # | Assumption | Risk if wrong | Early warning signal |
|---|-----------|---------------|---------------------|
| 1 | Volunteers adopt QR over cardboard | Permanent revert to cardboard | < 60% adoption in week 2 |
| 2 | Low-end phones run PWA at LCP ≤ 2.5s | App abandoned in the field | Lighthouse CI fails on Moto G4 |
| 3 | Supabase RLS + EIPD is RGPD-sufficient | Legal audit finds gaps | Lawyer review flags missing ARCO rights flow |
| 4 | Offline queue handles field conditions | Data loss or duplicates during shift | Stress test: 20 check-ins offline → reconnect → verify |
| 5 | GUF CSV fields map to schema | Incomplete family profiles at Gate 2 | Gate 0 audit session with Espe |
