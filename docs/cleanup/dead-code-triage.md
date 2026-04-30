# Dead-Code Triage — 2026-04-30

## Assumption Verification

| # | Assumption | Result |
|---|---|---|
| A1 | `mysql2` is unused | **KEEP** — `server/db.ts` imports `drizzle-orm/mysql2`; `server/_core/oauth.ts` and `server/_core/sdk.ts` import `server/db`. mysql2 is the Drizzle adapter for the template DATABASE_URL. Do NOT remove. |
| A2 | `vite-plugin-manus-runtime` ships into prod bundle | **KEEP** — `vitePluginManusDebugCollector` IS guarded with `NODE_ENV === "production"` check, but `vitePluginManusRuntime()` itself has no guard (line 153 of vite.config.ts). However, this is Manus platform tooling — see Q5 in questions_for_leo before removing. Out of scope per §scope_out. |
| A5 | Drizzle is duplicated effort | **KEEP** — `server/db.ts` uses `drizzle-orm/mysql2` for the template DATABASE_URL (MySQL/TiDB). Supabase client is separate. Both coexist intentionally in this template. |
| A6 | Two `database.types.ts` are duplicates | **NOT DUPLICATES** — `client/src/lib/supabase/database.types.ts` is a 2-line re-export from `client/src/lib/database.types.ts`. The canonical file is 1,628 lines. No action needed. |

## Confirmed dead (action: remove in §5.4)

- `add` — pnpm typo dep (devDependency); zero imports found in source
- `framer-motion` — zero imports in client/server/shared (depcheck confirmed)
- `html5-qrcode` — zero imports in client/server/shared (depcheck confirmed; QRScanner.tsx has a comment mentioning it as a previous bug cause, but no import)
- `slugify` — zero imports in client/server/shared
- `date-fns` — zero imports in client/server/shared
- `streamdown` — zero imports in client/server/shared (depcheck flagged; README mentions it but no actual import)
- `uuid` — zero imports in client/server/shared (z.string().uuid() is zod, not the uuid package)
- `@types/uuid` — zero imports; uuid itself is dead
- `@aws-sdk/client-s3` — zero imports; storage.ts uses Manus proxy, not direct S3
- `@aws-sdk/s3-request-presigner` — zero imports; same reason

## Dead-looking but DO NOT remove

- `tailwindcss-animate` — may be referenced in tailwind config or CSS; verify before removing
- `tw-animate-css` — same as above; CSS-only dep, depcheck misses CSS imports
- `@tailwindcss/typography` — may be used in tailwind config
- `autoprefixer` / `postcss` — build toolchain deps, depcheck false positive
- `tailwindcss` — build toolchain dep, depcheck false positive
- `pnpm` — devDep for CI scripts, depcheck false positive
- `@types/google.maps` — used in Map.tsx component type annotations (depcheck misses .d.ts usage)
- `mysql2` — see A1 above; KEEP

## Missing deps (depcheck false positives — path aliases)

- `@shared/const` → resolved via tsconfig path alias `shared/const.ts`
- `@shared/_core` → resolved via tsconfig path alias `shared/_core/`
- `server` → resolved via tsconfig path alias
- `https:` → supabase edge function (not in main bundle scope)

## knip

knip 6.9.0 crashed with `RangeError: Array buffer allocation failed` (OOM in sandbox).
depcheck results used as substitute. Manual grep verification performed for all flagged deps.
