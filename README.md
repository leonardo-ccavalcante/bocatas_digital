## What This Does

[Asociación Bocatas](https://bocatas.org/) serves **4,000+ vulnerable people per year** in Madrid through food distribution and social support. Before Bocatas Digital, volunteers managed attendance with a cardboard punch card (30 seconds per person, no data), registrations on paper forms (20 minutes each), and funding reports copied manually from a spreadsheet.

Bocatas Digital replaces all of that:

- **Check-in in < 8 seconds** — volunteer scans a QR card, a green/amber/red result card appears instantly. No text required: color + icon tell the full story.
- **New person registered in < 5 minutes** — a 4-step wizard on mobile with consent in the beneficiary's primary language.
- **Dashboard for funders in < 1 minute** — real-time KPI cards: today, this week, this month. CSV export, no spreadsheet needed.
- **Works offline** — check-ins queued locally during WiFi outages at remote service points; synced automatically on reconnect.
- **12 languages** — Spanish, Catalan, Galician, Basque, French, Wolof, Darija, Arabic, Brazilian Portuguese, English, Fula, and Mandinga.


---

## Architecture

| Layer | Technology | Notes |
|-------|-----------|-------|
| Build | **Vite 7** | TypeScript strict — zero `any` |
| Frontend | **React 19** + **wouter** (router) | SPA — see `client/src/App.tsx` for the route table |
| API | **tRPC v11** + Express | End-to-end typed; server bootstrap at `server/_core/index.ts` |
| UI | **shadcn/ui** + Tailwind CSS | Mobile-first. WCAG 2.1 AA. |
| Auth | **Manus OAuth** + **Supabase Auth** (test users) | Manus user IDs are non-UUID strings — see migration `20260501131457` |
| Server state | **TanStack Query v5** | All tRPC queries flow through generated hooks |
| UI state | **Zustand v5** | Session, sidebar, offline queue |
| State machine | **XState v5** | Check-in flow only |
| Validation | **Zod v3** | Single source of truth — no duplication in components |
| i18n | _Not yet wired_ | Spanish-only at the UI layer for Gate 1; consent templates seeded in 4 languages (es, ar, fr, bm) |
| Database (app) | **Supabase** PostgreSQL + RLS + Realtime | EU region · ~50 policies across 20 tables |
| Database (auth) | **MySQL** via drizzle-orm | Holds Manus OAuth `users` only — see [`drizzle/README.md`](./drizzle/README.md) |
| Offline | Optimistic local state + localStorage queue | Full PowerSync deferred per `CLAUDE.md` §3 |
| Messaging | **Chatwoot** + **n8n** on VPS | WhatsApp/email — NOT in this repo, event-driven via webhooks |
| CI/CD | **GitHub Actions** | Lint + typecheck + Lighthouse + advisor gate + types-drift gate + migration filename lint |

> **Why Vite, not Next.js?** Earlier prototypes used Next.js App Router; the project moved to Vite + React + wouter for faster iteration on the SPA-shaped product (no SSR needed for a logged-in admin/volunteer tool). Some commit history and older docs may still reference Next.js — that's historical, not current.

---

## Quick Start

You need: **Node.js ≥ 20**, **pnpm 10**, **Supabase CLI**, **Docker** (for local Supabase).

```bash
# 1. Clone
git clone https://github.com/leonardo-ccavalcante/bocatas_digital.git
cd bocatas_digital

# 2. Install dependencies
pnpm install

# 3. Environment variables
cp .env.example .env.local
# Edit .env.local — see comments inside for which values to fill in.

# 4. Start local Supabase (creates database + applies all migrations + seeds test data)
supabase start
supabase db reset
supabase gen types typescript --local > client/src/lib/database.types.ts

# 5. Start the dev server (Vite + tRPC server)
pnpm dev
# → http://localhost:3000
```

**Test credentials** are documented in [`docs/dev-setup.md`](./docs/dev-setup.md) (auto-seeded by `supabase db reset`). They are local-only — production uses Manus OAuth.

---

## Development

```bash
# Dev server (Vite + tRPC, port 3000)
pnpm dev

# Type checking (must pass before commit)
pnpm check

# Lint (ESLint — must pass before commit)
pnpm lint

# Unit + integration tests (Vitest)
pnpm test

# Production build (Vite + esbuild server bundle)
pnpm build

# Reset and re-seed local database
supabase db reset

# Regenerate TypeScript types after schema changes
supabase gen types typescript --local > client/src/lib/database.types.ts

# Apply new migration
# 1. Create file: supabase/migrations/YYYYMMDDhhmmss_description.sql
# 2. supabase db reset   ← verifies migration applies cleanly
# 3. supabase gen types typescript --local > client/src/lib/database.types.ts
```

---

## Project Structure

```
bocatas_digital/
├── client/                            # Frontend (Vite + React 19 SPA)
│   ├── src/
│   │   ├── App.tsx                    # wouter route table
│   │   ├── pages/                     # Top-level routed pages
│   │   ├── features/                  # Feature-based code (co-located schemas, hooks, components)
│   │   │   ├── families/
│   │   │   ├── persons/
│   │   │   ├── announcements/
│   │   │   ├── programs/
│   │   │   └── auth/
│   │   ├── components/                # Shared UI (shadcn/ui)
│   │   ├── lib/
│   │   │   ├── supabase/              # Supabase client (browser)
│   │   │   ├── trpc.ts                # tRPC client + React Query integration
│   │   │   └── database.types.ts      # Auto-generated from Supabase schema (do not edit)
│   │   └── store/                     # Zustand stores (UI state only)
│   └── public/                        # Static assets
├── server/                            # Backend (Express + tRPC, bundled with esbuild)
│   ├── _core/
│   │   ├── index.ts                   # Server bootstrap
│   │   ├── trpc.ts                    # tRPC router setup + adminProcedure
│   │   ├── context.ts                 # Per-request context (user, db, ip)
│   │   └── sdk.ts                     # Manus OAuth helpers
│   ├── routers/                       # tRPC routers (one per domain)
│   │   ├── families.ts                # Family CRUD, members, intake, deliveries
│   │   ├── persons.ts                 # Person registration + profile
│   │   ├── announcements.ts           # Novedades, audiences, audit log, bulk import
│   │   ├── admin.ts                   # User management + audit log read
│   │   └── programs.ts                # Programs catalog + session close
│   ├── db.ts                          # Drizzle (MySQL) connection — Manus auth side only
│   └── __tests__/                     # Vitest server-side tests
├── shared/                            # Code shared between client and server (zod, types, helpers)
├── supabase/
│   ├── migrations/                    # 28 canonical SQL migrations + EXPORTED/ (re-exported prod history)
│   └── functions/                     # Edge functions (OCR, etc.)
├── drizzle/                           # MySQL schema for Manus OAuth (separate DB) — see drizzle/README.md
├── scripts/                           # One-shot tools (export-applied-migrations.ts, etc.)
├── docs/                              # Plans, audits, migrations snapshots, dev setup
│   └── superpowers/plans/             # Per-feature implementation plans
├── .github/workflows/                 # CI: lint+typecheck+test, advisor gate, types-drift, migration-filename lint
├── vite.config.ts                     # Vite config (build + dev proxy to tRPC)
└── package.json                       # Single workspace — no monorepo
```


## Contributing

### For Developers

This project follows a **feature-agent swim lane model**. Before contributing, read [`CLAUDE.md`](CLAUDE.md) for the full agent orchestration playbook.

**Key conventions:**
- Feature code lives in `src/features/{name}/` — co-locate schemas, hooks, components, and tests
- Zod schemas are the single source of truth — never duplicate validation in components
- XState is used **only** for the check-in flow — not for forms or simple UI state
- All text must use `useTranslations()` — no hardcoded strings
- TypeScript strict mode — zero `any`
- WCAG 2.1 AA — semantic HTML, ARIA labels, ≥ 4.5:1 contrast ratios

**Workflow:**
```
1. Schema Agent: write migration + Zod schema (if new tables needed)
2. Run: supabase db reset && supabase gen types typescript
3. Write tests FIRST (RED) — Vitest unit + Playwright E2E
4. Implement to pass tests (GREEN)
5. Refactor (IMPROVE)
6. CI: npm run lint && npm run typecheck && npm run test && npx lhci autorun
7. PR: no merge without CI green
```

### For Translators

The app has 12 language translations. Three languages — **Wolof, Fula (Fulfulde), and Mandinga** — and the Moroccan Arabic dialect **Darija** need review by native speakers.

See [`src/i18n/TRANSLATOR_BRIEFING.md`](../src/i18n/TRANSLATOR_BRIEFING.md) for context, tone guidelines, critical terminology, and submission instructions.

If you can help translate, open an issue with the title `[TRANSLATION] [language name]` and we'll coordinate.

### For Volunteers Testing the App

During Gate 1, we test on real devices at service points. If you use the app and something feels wrong in your language — a confusing translation, a broken layout, text that's cut off — please open a GitHub issue with:
- Screenshot
- Your device model
- Language you were using

---

## RGPD / Data Protection

Bocatas Digital is designed for full GDPR (RGPD in Spain) compliance:

- **No PII in QR codes** — internal UUID only. A lost QR card reveals nothing.
- **No PII in logs** — IDs only, never names, phone numbers, or document numbers.
- **Row-Level Security** — every Supabase query is gated by RLS policy. Volunteers see only what their role allows.
- **High-risk fields protected** — `situacion_legal`, `foto_documento`, `recorrido_migratorio` are restricted to admin/superadmin only.
- **Consent is multilingual** — consent text is stored per-language in `consent_templates` and presented to each beneficiary in their primary language.
- **EIPD completed** — Data Protection Impact Assessment signed before any data collection.
- **Data controller:** Asociación Bocatas · bocatas@bocatas.es

---

## License

MIT License — see [LICENSE](LICENSE).

The translations for Wolof, Fula, and Mandinga are provided by community contributors and are released under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).

