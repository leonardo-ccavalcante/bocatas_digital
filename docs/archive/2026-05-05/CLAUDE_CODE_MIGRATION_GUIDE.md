# Members Migration Guide (historical)

> **Archived 2026-05-05** (was 235 lines, distilled to ≤150).
> **Status:** Migration complete. The work this guide describes has shipped — see migrations `20260504231437_backfill_familia_miembros_from_json` and `20260505105258_drop_families_miembros_json_column`.

## What this was

A step-by-step QA guide to execute the migration of family members from the legacy `families.miembros` JSONB column to the canonical `familia_miembros` relational table, plus verify the bug-fix where the dashboard had been showing `Total miembros: 0` because reads pulled from the wrong source.

## What ran

1. **Migration SQL** — `supabase/migrations/20260505_migrate_miembros_to_table.sql` (since deleted in Phase 3 cleanup; the work was reapplied via `20260505000001_backfill_familia_miembros_from_json.sql` which is the canonical version).
2. **Verification query** — confirmed `families` rows had matching `familia_miembros` rows.
3. **Tests** — 6/6 members-migration tests passing, 41/41 logging tests, 827+ total.
4. **Manual QA** — Familia #3 modal showed `Miembros Actuales (1)` post-migration (was `(0)` before).
5. **CRUD verification** — agregar / editar / eliminar miembros all worked through the modal; dashboard auto-updated.
6. **Logging** — `/admin/logs` showed correlation IDs for each member operation, CSV export worked.

## Final outcome

✅ Bug FIXED — dashboard and modal both read from `familia_miembros` (single source of truth).
✅ Schema scalable — relational table replaces JSONB array; CRUD via tRPC procedures.
✅ Logging — all member ops emit correlated structured logs.
✅ Production-ready — deployed.

## Key SQL (preserved for reference)

```sql
-- Verify migration succeeded
SELECT
  f.id,
  f.familia_numero,
  COUNT(fm.id) AS miembros_migrados,
  jsonb_array_length(COALESCE(f.miembros, '[]'::jsonb)) AS miembros_json_original
FROM public.families f
LEFT JOIN public.familia_miembros fm ON f.id = fm.familia_id
GROUP BY f.id, f.familia_numero, f.miembros
ORDER BY f.familia_numero;
```

(Note: as of `20260505105258_drop_families_miembros_json_column`, the `families.miembros` column no longer exists. Use `familia_miembros` table only.)

## Why this guide is archived, not deleted

It documents the QA path that was followed in Manus-mediated remote development (separate from local dev). Future operators doing similar JSONB → relational migrations can reuse the structure: SQL → automated tests → manual UI QA → logging verification → production checkpoint.

The TODO checklist at the bottom of the original file (4 phases × ~10 items) is fully checked off.
