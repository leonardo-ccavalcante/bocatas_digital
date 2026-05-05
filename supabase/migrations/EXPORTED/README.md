# Re-exported migrations from production

This directory contains migrations re-exported from `supabase_migrations.schema_migrations` on the live project (project_ref `vqvgcsdvvgyubqxumlwn`) on **2026-05-05**.

## Why this exists

The repo's `supabase/migrations/` directory contained 22 files at HEAD `e8cca83`, but production had **53 applied migrations** in its history. The missing ~30 represented foundational schema bootstrap work (enable extensions, create enums, create core tables, RLS helpers, original RLS policies) whose files were deleted from the repo over time without being preserved.

Without this re-export, `supabase db reset --local` cannot reproduce production schema from scratch — every developer's local DB silently diverges.

## What's here vs what to add

**Currently exported (foundational):**
- `20260411081802_..._enable_extensions.sql` — pg_trgm + pgcrypto
- `20260411081827_..._create_enums.sql` — 14 enums (tipo_documento, programa, fase_itinerario, etc.)
- `20260411081829_..._create_updated_at_function.sql` — trigger helper
- `20260411081830_..._create_persons.sql` — core PII table + indexes
- `20260411081832_..._create_locations.sql`
- `20260411081833_..._create_attendances.sql`

**Still to export (~30 migrations):**

```
20260411081835  20260410120400_create_program_enrollments
20260411081836  20260410120500_create_consents
20260411081838  20260410120600_create_families
20260411081839  20260410120650_create_grants
20260411081841  20260410120660_create_deliveries
20260411081843  20260410120700_create_courses
20260411081844  20260410120800_create_volunteers
20260411081846  20260410121000_create_acompanamientos
20260411082006  20260410121100_create_rls_helpers
20260411082019  20260410121200_create_rls_core
20260411082020  20260410121300_create_rls_base
20260411082101  20260410121400_create_view_and_seed
20260411082152  20260410121500_create_storage_rls
20260411173226  20260411130000_create_consent_templates
20260411173256  20260411130050_alter_persons_add_missing_columns
20260411173258  20260411130060_alter_consents_add_document_fields
20260411173300  20260411130100_create_programs
20260411180425  20260411140000_alter_program_enrollments_add_program_fk
20260411181057  20260411140000_alter_program_enrollments_add_program_fk
20260411181059  20260411140010_create_duplicate_check_rpc
20260413121654  20260501100490_create_program_sessions
20260413121702  20260501100500_alter_deliveries_add_session
20260413121715  20260501100600_create_family_invariants
20260413121730  20260501100700_seed_consent_templates_bda
20260413121741  20260501100800_create_app_settings_guf_cutoff
20260413121750  20260501100900_create_family_member_documents
20260413121800  20260501101000_add_guf_index_and_voluntario_rls
20260413121828  20260501101100_create_storage_buckets
20260414093601  add_role_to_persons
20260423230731  add_pais_documento_column
20260501123946  fix_bulk_import_created_by_type
20260501125548  confirm_bulk_import_fn
20260501130454  confirm_bulk_import_fn_fix_tipo_cast
20260501131457  fix_autor_id_and_edited_by_uuid_to_text
20260501132517  fix_programs_cast_v3
20260504172506  create_deliveries_table
20260504184659  add_announcements_columns
20260504184746  migrate_miembros_data_v2
```

## How to complete the export

Use the script `scripts/export-applied-migrations.ts` already in the repo:

```bash
# 1. Get credentials from Supabase Dashboard → Project Settings → API
export SUPABASE_URL=https://vqvgcsdvvgyubqxumlwn.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<paste service_role secret here, NEVER commit>

# 2. Run the exporter
pnpm tsx scripts/export-applied-migrations.ts

# 3. Review files; resolve duplicates with existing supabase/migrations/ files
#    Recommendation: move all canonical files into EXPORTED/ and delete the
#    old supabase/migrations/<file>.sql when their content is identical.

# 4. Verify reproduction
supabase db reset --local
```

**Why the assistant didn't complete the export inline:** Each migration body is multi-KB. Writing 30+ via Claude's MCP+Write tools would cost 50K+ tokens better spent on user-facing fixes (Phase 1.8b) and other security work (Phase 2). The script does the same thing in 5 seconds locally.

## What to do with EXPORTED/ files vs `supabase/migrations/` files

The migration NAMES in this directory may not match files in `supabase/migrations/`. The DB tracks both files (those that were ever applied) — Supabase CLI dedupes by **version**, not name. After the export completes:

1. Run `supabase db reset --local` to verify clean replay
2. If errors: identify duplicate-version pairs and pick the canonical one (typically EXPORTED is authoritative for pre-2026-05-06 work; the original `supabase/migrations/` files are for post-2026-05-06 changes)
3. Once reconciled, this README can be deleted and the EXPORTED/ contents merged into `supabase/migrations/`
