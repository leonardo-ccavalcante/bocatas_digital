# Pre-cull snapshots — 2026-05-05

This directory documents the state of 7 tables **immediately before** they were dropped by migration `20260506000001_drop_dead_tables.sql`. Captured as evidence and for potential schema reference if any Module 2-9 feature is rebuilt later.

## Why these were dropped

All 7 tables had:
- **Zero `.from()` calls** in `server/`, `client/`, `shared/` (verified by grep audit)
- **Zero writes ever** in `pg_stat_user_tables` (`n_tup_ins=0, n_tup_upd=0, n_tup_del=0`)
- **No functional dependencies** in the application code path

User explicitly approved the drop list (option B/B2 in conversation, kept `grants` because it holds €45k IRPF tracking row).

## Drop list (final)

| Table | Rows | Size | Policies | Type | Schema preserved |
|---|---|---|---|---|---|
| `families_pre_backfill_20260430` | 1 | 8 KB | 0 | Backup snapshot of family flags before 2026-04-30 backfill | `schemas.sql` + `families_pre_backfill_20260430.json` |
| `families_miembros_backup_20260505` | 2 | 16 KB | 0 | Backup of `families.miembros` JSON column before drop. Data already migrated to `familia_miembros` table — backup redundant. **Contained PII (names, birthdates) — not committed to git.** | `schemas.sql` only |
| `entregas` | 0 | 24 KB | 4 | Legacy delivery table, superseded by `public.deliveries` (migration `20260411081841`). | `schemas.sql` only |
| `entregas_batch` | 0 | 24 KB | 0 | Legacy companion to `entregas`. | `schemas.sql` only |
| `acompanamientos` | 0 | 32 KB | 1 | Module 5+ stub (case-management accompaniment tracking). Drop because user opted to remove all Module 2-9 stubs (CLAUDE.md guard rail acknowledged). | `schemas.sql` only |
| `courses` | 0 | 32 KB | 2 | Module 3 stub (formación / training pathway). | `schemas.sql` only |
| `volunteers` | 0 | 48 KB | 1 | Module 6 stub (volunteer profile metadata: skills, hours, availability). **Distinct from volunteer registration**, which uses `auth.users.raw_user_meta_data.role = 'voluntario'` and is unaffected. | `schemas.sql` only |

## What this preserves

- **`schemas.sql`** — the column definitions of all 7 dropped tables, so if Module 3/5/6 is built later, the engineer can review the previous schema design as a starting point (or deliberately reject it).
- **`families_pre_backfill_20260430.json`** — the 1 row of the family-flags backup table. No PII, just booleans like `docs_identidad`, `informe_social`, `consent_*`. Useful if anyone needs to verify the post-backfill state of family `d0000000-…-001`.

## What this does NOT preserve

- **PII data from `families_miembros_backup_20260505`.** Per `CLAUDE.md` §3 (compliance: "Do NOT log PII"), names and birthdates are not committed. The data was already cleanly migrated to `familia_miembros` before the cull — no information loss.

## Restore / rebuild guidance

If a future module needs one of these schemas back:

1. **`courses`, `volunteers`, `acompanamientos`** — review `schemas.sql` for prior design intent. Treat as one input among several when designing the actual feature. Don't recreate the schema verbatim — design fresh from the feature spec.
2. **`entregas` / `entregas_batch`** — do NOT rebuild. The data model migrated cleanly to `public.deliveries` and recreating the legacy tables would re-introduce the dual-source problem.
3. **`families_pre_backfill_*`, `families_miembros_backup_*`** — these were one-off backups. Do not recreate as patterns.

## Verification trail

- `mcp__supabase__execute_sql` — `SELECT COUNT(*) FROM pg_stat_user_tables WHERE relname IN (...)` confirms zero writes.
- `grep -rn 'from(["'"'"']<table>["'"'"'])'` — confirms zero application references.
- `mcp__supabase__get_advisors(type='security')` — pre-drop baseline captured; post-drop should not introduce HIGH advisors.
