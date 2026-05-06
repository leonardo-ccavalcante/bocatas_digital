# Problem Solving Framework — Bocatas Digital

> **Archived 2026-05-05** (was 155 lines, distilled to ≤150).
> **Date written:** 2026-04-12. Status at archive time: Gates 0+1 done, Gates 2-5 deferred.

## Problem statement

Bocatas Digital replaces 6 fragmented systems (WhatsApp, spreadsheets, paper forms, email, manual Supabase queries, verbal handoffs) with a unified attendance + program management platform.

Pre-existing pain:
- No single source of truth for attendance
- 2–3 hours/week of manual data entry
- No real-time visibility for coordinators
- No audit trail for beneficiary interactions
- No self-service check-in

Goal: real-time attendance, program analytics, self-service registration.

## Stakeholder map

| Stakeholder | Role | Primary need | Success metric |
|---|---|---|---|
| Nacho & Espe | Program Directors | Real-time attendance | Dashboard KPI < 5s latency |
| Soledad | Volunteer Coordinator | Self-service check-in | 80% of volunteers using QR by week 4 |
| Volunteers | Check-in operators | Fast, reliable scanning | < 2s/scan, 0 false negatives |
| Leo (Dev) | Tech Lead | Clean codebase | 0 tech debt, 100% test coverage |
| Beneficiaries | Attendees | Frictionless check-in | < 30s arrival → seated |

## Issue tree (MECE) — at time of writing

- **A. Dead files** (orphaned imports): `src/lib/database.types.ts` root copy, `client/src/features/checkin/schemas.ts`, `useSupabaseAuth.ts`, `ComponentShowcase.tsx`, `Checkin.tsx` (case collision), `AIChatBox.tsx`, `ManusDialog.tsx`, `Map.tsx`, `DashboardLayout*.tsx`, `AuthCallback.tsx` (Supabase-native auth, incompatible with Manus)
- **B. Dead store fields**: `pendingQueue`, `addPendingCheckin`, `markSynced`, `clearSynced` in `useAppStore` — superseded by `useCheckinStore`
- **C. Critical bug**: offline queue never activates — `useOnlineStatus()` reads `navigator.onLine` once, no event listener
- **D. React violation**: `localStorage.setItem` inside `useMemo` in `useAuth.ts`
- **E. Config error**: `.env.example` uses `NEXT_PUBLIC_` (Next.js) instead of `VITE_`
- **F. Enum duplication**: `CheckinPrograma` / `CheckinMetodo` defined 3× across machine + router + (dead) schemas

> Most A/B/C/D items have since shipped (see migrations 20260411..., dead-code sweeps, and the Phase 3 cleanup PR). E was fixed when the Vite migration completed. F: enum hoisting is on the M-10 follow-up list.

## Gate scope

| Gate | Status (2026-05-05) | Scope |
|---|---|---|
| Gate 0 | ✅ done | Scaffold + Auth (Manus OAuth) |
| Gate 1 | ✅ done | Epic A persons + Epic B QR check-in + Epic C dashboard |
| Gate 2 | ⏸ deferred | Program management UI (admin panel) |
| Gate 3 | ⏸ deferred | Volunteer self-service portal |
| Gate 4 | ⏸ deferred | Advanced analytics |
| Gate 5 | ⏸ deferred | WhatsApp / Sheets / Slack integrations |

## SAT stress-test — assumptions vs evidence

| Assumption | Evidence | Risk |
|---|---|---|
| Volunteers will use QR | 100% adoption in 2-week pilot | LOW |
| Realtime < 5s acceptable | Stakeholder: "5s is fine" | LOW |
| Offline queue used | WiFi gaps 2–3×/week, 10–30 min | MEDIUM |
| CSV export covers reporting | Stakeholder spec | LOW |
| Bundle < 300 KB achievable | Recharts ~100 KB (lazy-load needed) | MEDIUM |

## Out of scope (Gate 1)

OCR for all docs (DNI only), 4-language UI (Spanish only), GUF (→Gate 3), WhatsApp (→Gate 5), case management (→Gate 4), advanced analytics (→Gate 4).

## Metrics at archive time

| Metric | Target | At archive |
|---|---|---|
| Tests passing | 100% | 884/884 |
| Build green | 0 errors | 0 errors (one pre-existing TS1501 in audit-no-pii.test.ts:47) |
| Bundle size | < 300 KB gzip | 296 KB |
| Dashboard latency | < 5s | TBD |
| Volunteer adoption | 80% by week 4 | TBD |
