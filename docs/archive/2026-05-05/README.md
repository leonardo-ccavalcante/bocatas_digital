# Archive — 2026-05-05

Twelve `.md` files moved out of the repo root as part of Phase 5 cleanup (M-6 in the v2 remediation plan + the `≤150 lines per file` cap requested 2026-05-05).

| File | Original lines | Archived lines | Treatment |
|---|---|---|---|
| ADMIN_ACCESS.md | 180 | 65 | Distilled — kept role table, promote-SQL, troubleshooting |
| ANNOUNCEMENT_FEATURES_TODO.md | 44 | 44 | Copy as-is (already ≤150) |
| AUDIT_FINDINGS.md | 389 | 91 | Distilled — kept exec summary, issue ledger, action queue |
| CLAUDE_CODE_MIGRATION_GUIDE.md | 235 | 47 | Distilled — work shipped; kept SQL + outcome |
| HANDOFF_TASK3.md | 138 | 138 | Copy as-is |
| LOGGING_SYSTEM.md | 374 | 100 | Distilled — kept architecture, log shape, admin endpoints, best practices |
| MEMBERS_MIGRATION_TODO.md | 115 | 115 | Copy as-is |
| PROBLEM_SOLVING.md | 155 | 73 | Distilled — kept stakeholder map, MECE issue tree, gates, SAT |
| RESPONSIVENESS_AUDIT_PLAN.md | 125 | 125 | Copy as-is |
| ROOT_CAUSE_ANALYSIS.md | 204 | 94 | Distilled — kept the Label×Card flex anti-pattern + lessons |
| TODO_PR17_IMPLEMENTATION.md | 114 | 114 | Copy as-is |
| todo.md | 1633 | 79 | Distilled — kept high-level inventory of what shipped per task |

## Why archive instead of delete

These docs describe shipped work + design decisions. The full text is preserved in git history at the parent commit of branch `cleanup/phase5-docs-and-cleanup`. The archive copies are sized to be readable as historical reference.

## Current authoritative sources

| Topic | Authoritative source |
|---|---|
| Architecture overview | [`README.md`](../../../README.md) |
| Live schema | `mcp__supabase__list_migrations` |
| Live RLS state | `mcp__supabase__execute_sql` against `pg_policies` |
| Open work | GitHub PRs |
| Plan history | [`docs/superpowers/plans/`](../../superpowers/plans/) |

## After this archive

The repo root has only 2 `.md` files: `README.md` (project overview, Vite stack) and `ARCHITECTURE.md` (architecture deep-dive). All historical / TODO / audit docs live under `docs/archive/<date>/`.
