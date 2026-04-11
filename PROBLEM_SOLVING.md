# Problem Solving Framework — Bocatas Digital

**Date**: 2026-04-12  
**Version**: Gate 1 (MVP)  
**Methodology**: MECE (Mutually Exclusive, Collectively Exhaustive) + SAT (Stress-test Assumptions)

---

## Problem Statement

Bocatas Digital is a **unified attendance & program management platform** for a social dining and support organization. Previously, 6 fragmented systems (WhatsApp, spreadsheets, paper forms, email, Supabase manual queries, and verbal handoffs) created:

- **Data fragmentation** — no single source of truth for attendance
- **Manual overhead** — 2-3 hours/week of data entry and reconciliation
- **No real-time visibility** — program coordinators couldn't see daily attendance trends
- **Compliance risk** — no audit trail for beneficiary interactions
- **Volunteer friction** — no self-service check-in, manual registration only

**Goal**: Replace 6 systems with 1 unified platform that enables real-time attendance tracking, program analytics, and self-service registration.

---

## Stakeholder Map

| Stakeholder | Role | Primary Need | Success Metric |
|-------------|------|--------------|-----------------|
| **Nacho & Espe** | Program Directors | Real-time attendance visibility | Dashboard KPI < 5s latency |
| **Soledad** | Volunteer Coordinator | Self-service check-in | 80% of volunteers use QR by week 4 |
| **Volunteers** | Check-in operators | Fast, reliable QR scanning | < 2s per scan, 0 false negatives |
| **Leo (Dev)** | Tech Lead | Clean, maintainable codebase | 0 tech debt, 100% test coverage |
| **Beneficiaries** | Attendees | Frictionless check-in | < 30s from arrival to seated |

---

## Issue Tree (MECE Decomposition)

```
Problems found across 3 sprints (Task 1 + Epic A + Epic B)
│
├── A. DEAD FILES — orphaned, zero imports, safe to delete
│   ├── src/lib/database.types.ts (root-level copy, real file is client/src/lib/)
│   ├── client/src/features/checkin/schemas.ts (enums wrong + outdated, never imported)
│   ├── client/src/lib/supabase/useSupabaseAuth.ts (pre-Manus-OAuth artifact)
│   ├── client/src/pages/ComponentShowcase.tsx (not in App.tsx router)
│   ├── client/src/pages/Checkin.tsx ← CASE COLLISION with CheckIn.tsx
│   ├── client/src/components/AIChatBox.tsx (scaffold artifact)
│   ├── client/src/components/ManusDialog.tsx (scaffold artifact)
│   ├── client/src/components/Map.tsx (scaffold artifact)
│   ├── client/src/components/DashboardLayout.tsx (scaffold artifact)
│   ├── client/src/components/DashboardLayoutSkeleton.tsx (scaffold artifact)
│   └── client/src/pages/AuthCallback.tsx (uses Supabase native auth, incompatible)
│
├── B. DEAD STORE FIELDS — superseded by useCheckinStore
│   └── pendingQueue, addPendingCheckin, markSynced, clearSynced in useAppStore.ts
│
├── C. CRITICAL BUG — offline queue never activates
│   └── useOnlineStatus() reads navigator.onLine once, no event listeners
│
├── D. REACT VIOLATION — side effect inside useMemo
│   └── localStorage.setItem inside useMemo in useAuth.ts
│
├── E. CONFIG ERROR — wrong env prefix
│   └── .env.example uses NEXT_PUBLIC_ (Next.js) instead of VITE_ (Vite app)
│
└── F. ENUM DUPLICATION — same enum defined 3x
    └── CheckinPrograma / CheckinMetodo in machine + router + (dead) schemas
```

---

## Gate 1 Acceptance Criteria

| Gate | Status | Criteria |
|------|--------|----------|
| **Gate 0** | ✅ DONE | Scaffold + Auth (Manus OAuth) |
| **Gate 1** | 🔄 IN PROGRESS | Epic A (Person registration) + Epic B (QR check-in) + Epic C (Dashboard) |
| **Gate 2** | ⏸️ DEFERRED | Program management UI (admin panel) |
| **Gate 3** | ⏸️ DEFERRED | Volunteer self-service portal |
| **Gate 4** | ⏸️ DEFERRED | Advanced analytics (cohort analysis, trend forecasting) |
| **Gate 5** | ⏸️ DEFERRED | Integrations (WhatsApp, Google Sheets, Slack) |

### Gate 1 Scope (MVP)

**Epic A: Person Registration** ✅
- Registration wizard (6 steps: personal, family, dietary, documents, consents, review)
- Document capture + OCR (DNI extraction)
- Dietary restrictions tracking
- Consent management (GDPR-compliant)

**Epic B: QR Check-in** ✅
- QR code generation & scanning (html5-qrcode)
- Duplicate detection (same program, same day = amber card)
- Offline queue + sync on reconnect
- Manual fallback (fuzzy search)
- Demo mode for testing

**Epic C: Dashboard** 🔄
- KPI cards (today / this week / this month)
- Trend chart (last 4 weeks)
- CSV export (anonymized)
- Supabase Realtime (< 5s latency)
- Mobile-first layout (360px minimum)

---

## SAT Stress-Test (Assumptions)

| Assumption | Evidence | Risk |
|-----------|----------|------|
| "Volunteers will use QR scanning" | Pilot feedback: 100% adoption in 2-week trial | LOW — proven in pilot |
| "Realtime < 5s is acceptable" | Stakeholder interview: "We check dashboard 2x/day, 5s is fine" | LOW — explicit requirement |
| "Offline queue will be used" | Venue has WiFi gaps (2-3x/week, 10-30min outages) | MEDIUM — rare but critical |
| "CSV export covers reporting needs" | Stakeholder: "We need date, time, person, location, program" | LOW — explicit spec |
| "Bundle < 300KB is achievable" | Recharts alone = 100KB gzip, but lazy-loadable | MEDIUM — requires lazy-loading |

---

## Next Sprint (Gate 1 Completion)

1. **Refactor**: Clean dead code, fix offline queue, move localStorage side effect
2. **Epic C**: Wire dashboard stub to real components
3. **Testing**: 100% acceptance criteria coverage
4. **Merge**: PR #1 → main
5. **Handoff**: Documentation + training for volunteers

---

## Deferred Features (Out of Scope for Gate 1)

See `OCCAM_RAZOR.md` for detailed rationale.

- **OCR for all document types** — MVP: DNI only
- **4-language UI** — MVP: Spanish only
- **GUF (Gestión Única de Familias)** — deferred to Gate 3
- **WhatsApp integration** — deferred to Gate 5
- **Case management** — deferred to Gate 4
- **Advanced analytics** — deferred to Gate 4

---

## Metrics & Success

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Tests passing | 100% | 155/155 | ✅ |
| Build green | 0 errors | 0 errors | ✅ |
| Bundle size | < 300KB gzip | 296 kB | ✅ |
| Offline queue | Works | Fixed in refactor | 🔄 |
| Dashboard latency | < 5s | TBD | 🔄 |
| Volunteer adoption | 80% by week 4 | TBD | 🔄 |

---

**Owner**: Leo Cavalcante (dev@bocatas.io)  
**Last Updated**: 2026-04-12
