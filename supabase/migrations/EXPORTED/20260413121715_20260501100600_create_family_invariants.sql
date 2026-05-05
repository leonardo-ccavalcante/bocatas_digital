-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260413121715 — name: 20260501100600_create_family_invariants

CREATE OR REPLACE FUNCTION enforce_kg_total() RETURNS TRIGGER AS $$
BEGIN
  NEW.kg_total := COALESCE(NEW.kg_frutas_hortalizas,0) + COALESCE(NEW.kg_carne,0)
                + COALESCE(NEW.kg_infantil,0) + COALESCE(NEW.kg_otros,0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deliveries_kg_total ON deliveries;
CREATE TRIGGER trg_deliveries_kg_total
  BEFORE INSERT OR UPDATE ON deliveries FOR EACH ROW EXECUTE FUNCTION enforce_kg_total();

CREATE OR REPLACE FUNCTION enforce_member_counts() RETURNS TRIGGER AS $$
BEGIN
  NEW.num_adultos := (
    SELECT COUNT(*) FROM jsonb_array_elements(COALESCE(NEW.miembros, '[]'::jsonb)) AS m
    WHERE COALESCE((m->>'fecha_nacimiento')::DATE, CURRENT_DATE - INTERVAL '20 years')
          <= CURRENT_DATE - INTERVAL '18 years'
  );
  NEW.num_menores_18 := (
    SELECT COUNT(*) FROM jsonb_array_elements(COALESCE(NEW.miembros, '[]'::jsonb)) AS m
    WHERE (m->>'fecha_nacimiento') IS NOT NULL
      AND (m->>'fecha_nacimiento')::DATE > CURRENT_DATE - INTERVAL '18 years'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_families_member_count ON families;
CREATE TRIGGER trg_families_member_count
  BEFORE INSERT OR UPDATE ON families FOR EACH ROW EXECUTE FUNCTION enforce_member_counts();

DROP INDEX IF EXISTS uq_families_one_active_per_titular;
CREATE UNIQUE INDEX uq_families_one_active_per_titular
  ON families (titular_id) WHERE estado = 'activa' AND deleted_at IS NULL;
