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
| Framework | **Next.js 14** App Router | TypeScript strict — zero `any` |
| UI | **shadcn/ui** + Tailwind CSS | Mobile-first. WCAG 2.1 AA. |
| Auth | **Supabase** OAuth (Google) + `@supabase/ssr` | Google Workspace for volunteers |
| Server state | **TanStack Query v5** | All Supabase queries go through hooks |
| UI state | **Zustand v4** | Session, sidebar, offline queue |
| State machine | **XState v5** | Check-in flow only |
| Validation | **Zod v3** | Single source of truth — no duplication in components |
| i18n | **next-intl v3** | 12 languages, RTL support for Arabic/Darija |
| Database | **Supabase** (PostgreSQL + RLS + Realtime) | EU region · 24 RLS policies |
| Offline | **Optimistic local state** + localStorage queue | Full PowerSync: Gate 1 end |
| Messaging | **Chatwoot** + **n8n** on VPS | WhatsApp/email — NOT in this repo |
| CI/CD | **GitHub Actions** | Lint + typecheck + Lighthouse ≥ 95 on every PR |

---

## Language Support

| Code | Language | Endonym | Direction | Status |
|------|----------|---------|-----------|--------|
| `es` | Spanish | Español | LTR | ✅ Source language |
| `ca` | Catalan | Català | LTR | ✅ Complete |
| `gl` | Galician | Galego | LTR | ✅ Complete |
| `eu` | Basque | Euskera | LTR | ✅ Complete |
| `fr` | French | Français | LTR | ✅ Complete |
| `pt-BR` | Brazilian Portuguese | Português | LTR | ✅ Complete |
| `en` | English | English | LTR | ✅ Complete |
| `ar` | Arabic | العربية | **RTL** | ✅ Complete |
| `ary` | Darija | الدارجة | **RTL** | ⚠ Pending native review |
| `wo` | Wolof | Wolof | LTR | ⚠ Pending native review |
| `ff` | Fula | Fulfulde | LTR | ⚠ Pending native review |
| `mnk` | Mandinga | Mandinka | LTR | ⚠ Pending native review |

Languages marked ⚠ fall back to French while awaiting review by a native speaker. See [`src/i18n/TRANSLATOR_BRIEFING.md`](../src/i18n/TRANSLATOR_BRIEFING.md) if you can help.

---

## Quick Start

You need: **Node.js ≥ 20**, **Supabase CLI**, **Docker** (for local Supabase).

```bash
# 1. Clone
git clone https://github.com/leonardo-ccavalcante/bocatas_digital.git
cd bocatas_digital

# 2. Install dependencies
npm install

# 3. Environment variables
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
# (local values provided automatically by `supabase start` below)

# 4. Start local Supabase (creates database + applies all migrations + seeds test data)
supabase start
supabase db reset
supabase gen types typescript --local > src/lib/database.types.ts

# 5. Start the dev server
npm run dev
# → http://localhost:3000 → redirects to http://localhost:3000/es/login
```

**Test credentials (local only):**

| Role | Email | Password |
|------|-------|----------|
| Voluntario | `voluntario@bocatas.test` | `BocatasVol2026!` |
| Admin | `admin@bocatas.test` | `BocatasAdmin2026!` |
| Superadmin | `superadmin@bocatas.test` | `BocatasSuperAdmin2026!` |

> These credentials only work in local development mode. Production uses Google OAuth exclusively.

---

## Development

```bash
# Dev server (port 3000)
npm run dev

# Type checking (must pass before commit)
npm run typecheck

# Lint (ESLint — must pass before commit)
npm run lint

# Unit + integration tests (Vitest)
npm run test

# E2E tests (Playwright)
npm run test:e2e

# Validate all 12 translation files (fail if any key missing)
npx tsx src/i18n/validate-keys.ts

# Performance audit (Lighthouse CI — requires dev server running)
npx lhci autorun

# Reset and re-seed local database
supabase db reset

# Regenerate TypeScript types after schema changes
supabase gen types typescript --local > src/lib/database.types.ts

# Apply new migration
# 1. Create file: supabase/migrations/YYYYMMDDHHMMSS_description.sql
# 2. supabase db reset   ← verifies migration applies cleanly
# 3. supabase gen types typescript --local > src/lib/database.types.ts
```

---

## Project Structure

```
bocatas_digital/
├── src/
│   ├── app/
│   │   └── [locale]/              # Next.js App Router — all routes under locale segment
│   │       ├── layout.tsx         # Root layout: NextIntlClientProvider + RTL support
│   │       ├── (auth)/login/      # Public login page
│   │       └── (protected)/       # Auth-gated routes
│   │           ├── checkin/       # Epic B: QR check-in (XState machine)
│   │           ├── personas/      # Epic A: Person registration + profile
│   │           ├── dashboard/     # Epic C: KPI dashboard
│   │           ├── admin/         # Admin: consent templates, program catalog
│   │           └── novedades/     # Announcements
│   ├── features/                  # Feature-based code (co-located schemas, hooks, components)
│   │   ├── checkin/
│   │   ├── personas/
│   │   ├── dashboard/
│   │   └── auth/
│   ├── components/                # Shared UI components
│   │   ├── LanguageSwitcher.tsx
│   │   ├── RtlProvider.tsx
│   │   └── ui/                    # shadcn/ui components
│   ├── i18n/                      # i18n configuration
│   │   ├── routing.ts             # 12 locales definition
│   │   ├── request.ts             # Per-request locale loading
│   │   ├── navigation.ts          # Typed navigation helpers
│   │   ├── validate-keys.ts       # CI script: 0 missing keys
│   │   ├── GLOSSARY.md            # Domain terminology × 12 languages
│   │   └── TRANSLATOR_BRIEFING.md # Handoff guide for professional translators
│   ├── messages/                  # Translation files (96 JSON files)
│   │   ├── es/                    # Spanish (source)
│   │   ├── ca/ gl/ eu/            # Spanish co-official languages
│   │   ├── fr/ pt-BR/ en/ ar/     # International languages
│   │   └── ary/ wo/ ff/ mnk/      # Community languages (pending native review)
│   ├── lib/
│   │   ├── supabase/              # Supabase client (browser + server)
│   │   └── database.types.ts      # Auto-generated from schema (do not edit)
│   └── store/                     # Zustand stores (UI state only)
├── supabase/
│   ├── migrations/                # 22 SQL migrations (Gate 0 + Gate 1)
│   ├── functions/                 # Edge functions (extract-document, etc.)
│   └── seed.sql                   # Test data (4 users, sample persons)
├── __tests__/                     # Test files (Vitest + Playwright)
├── docs/                          # Documentation
│   ├── README_GITHUB.md           # This file
│   └── superpowers/plans/         # Implementation epics (Tasks 1–8)
├── .github/workflows/ci.yml       # GitHub Actions CI/CD
├── middleware.ts                  # Locale detection + auth guard
├── next.config.ts                 # withNextIntl() + Next.js config
└── CLAUDE.md                      # AI agent orchestration playbook
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

