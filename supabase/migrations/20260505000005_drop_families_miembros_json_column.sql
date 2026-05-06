-- Drop the families.miembros JSONB column.
-- familia_miembros table is now the sole source of truth for member rows.
-- Pre-condition: code that writes/reads families.miembros has been removed
-- in the same PR (families.create, families.addMember, persons.createFamily,
-- and getPendingItems).
--
-- Backup: contents of the column for non-empty arrays are saved to
-- public.families_miembros_backup_20260505 (ad-hoc table created via MCP
-- before this drop). 30-day retention; drop the backup table after that.
--
-- Rollback: restore from the backup table:
--   ALTER TABLE families ADD COLUMN miembros jsonb DEFAULT '[]'::jsonb;
--   UPDATE families f
--     SET miembros = b.miembros
--     FROM families_miembros_backup_20260505 b
--     WHERE f.id = b.id;

ALTER TABLE public.families DROP COLUMN IF EXISTS miembros;
