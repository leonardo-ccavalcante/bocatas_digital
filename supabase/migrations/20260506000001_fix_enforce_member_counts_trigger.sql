-- Drop the old trigger that referenced the dropped families.miembros JSONB column.
-- num_adultos / num_menores_18 are now managed by the application layer
-- (families.create, families.addMember) using familia_miembros as the source
-- of truth for member rows.
--
-- Context: families.miembros was dropped in 20260505000005. The trigger
-- enforce_member_counts() still referenced NEW.miembros, causing every INSERT
-- and UPDATE on families to fail with "record 'new' has no field 'miembros'".
DROP TRIGGER IF EXISTS trg_families_member_count ON public.families;
DROP FUNCTION IF EXISTS public.enforce_member_counts();
