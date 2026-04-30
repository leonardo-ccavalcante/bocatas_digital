# Assumptions Verification — 2026-04-30

Verified inline per §5.3 instructions. Commands and results below.

## A1 — mysql2 is unused

**Command:** `pnpm why mysql2` + `grep -rn "mysql2" client server shared`

**Result:** `server/db.ts:2` imports `drizzle-orm/mysql2`; `server/_core/oauth.ts` and `server/_core/sdk.ts` import `server/db`. mysql2 is the Drizzle adapter for the template DATABASE_URL (MySQL/TiDB connection string).

**Decision:** A1 → **KEEP mysql2. Skip §5.4 mysql2 removal.**

---

## A2 — vite-plugin-manus-runtime ships into prod bundle (not guarded)

**Command:** `grep -A 3 "manus-runtime" vite.config.ts`

**Result:** `vitePluginManusDebugCollector` has a `NODE_ENV === "production"` guard (returns html unchanged). However, `vitePluginManusRuntime()` itself is called unconditionally in the plugins array (line 153). The debug collector script injection IS guarded; the runtime plugin itself is not.

**Decision:** A2 → **vitePluginManusRuntime is NOT guarded for dev only.** However, this is Manus platform tooling (Q5 in questions_for_leo). Per §scope_out, Manus tooling removal is a possible §5.11 follow-up, not in current scope.

---

## A5 — Drizzle is duplicated effort with Supabase migrations

**Command:** `cat drizzle/schema.ts` + `grep -rn "drizzle-orm" client server shared`

**Result:** `server/db.ts` uses `drizzle-orm/mysql2` for the template DATABASE_URL (MySQL/TiDB). Supabase client uses `@supabase/supabase-js` with service-role key. Both coexist: Drizzle handles the MySQL/TiDB template DB; Supabase handles the PostgreSQL production DB. This is the template's dual-DB architecture.

**Decision:** A5 → **KEEP drizzle. Both databases are in use. Do not remove drizzle-* deps.**

---

## A6 — Two database.types.ts files are duplicates

**Command:** `diff client/src/lib/database.types.ts client/src/lib/supabase/database.types.ts`

**Result:** `client/src/lib/supabase/database.types.ts` is 2 lines — a re-export from the canonical `client/src/lib/database.types.ts` (1,628 lines). They are NOT duplicates; the supabase path is a convenience re-export.

**Decision:** A6 → **NOT duplicates. Keep both. No action needed.**
