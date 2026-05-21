-- Phase 3 Task 1 — instituciones global catalog (reusable across all programs).
-- distrito auto-derives from codigo_postal via madrid_distrito_for() (Phase 2).

CREATE TABLE IF NOT EXISTS instituciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  tipo text CHECK (tipo IN ('publica','ong','parroquia','privada','otro')),
  areas text[] NOT NULL DEFAULT '{}',
  direccion text,
  codigo_postal text,
  distrito text,
  telefono text,
  email text,
  notas text,
  is_active boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX instituciones_active_idx ON instituciones(is_active, nombre);
CREATE INDEX instituciones_distrito_idx ON instituciones(distrito) WHERE distrito IS NOT NULL;
CREATE INDEX instituciones_areas_idx ON instituciones USING gin(areas);

-- Auto-set distrito from codigo_postal (uses madrid_distrito_for from Phase 2).
CREATE OR REPLACE FUNCTION instituciones_set_distrito() RETURNS trigger AS $$
BEGIN
  NEW.distrito := madrid_distrito_for(NEW.codigo_postal);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER instituciones_distrito_sync
  BEFORE INSERT OR UPDATE OF codigo_postal ON instituciones
  FOR EACH ROW EXECUTE FUNCTION instituciones_set_distrito();

CREATE TRIGGER instituciones_updated_at
  BEFORE UPDATE ON instituciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE instituciones ENABLE ROW LEVEL SECURITY;

-- admin/superadmin/voluntario read; admin/superadmin create (inline form during
-- Derivar flow); superadmin-only modify/delete (catalog governance).
CREATE POLICY "instituciones_read_authenticated"
  ON instituciones FOR SELECT TO authenticated
  USING (get_user_role() IN ('admin','superadmin','voluntario'));

CREATE POLICY "instituciones_admin_create"
  ON instituciones FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin','superadmin'));

CREATE POLICY "instituciones_superadmin_modify"
  ON instituciones FOR UPDATE TO authenticated
  USING (get_user_role() = 'superadmin')
  WITH CHECK (get_user_role() = 'superadmin');

CREATE POLICY "instituciones_superadmin_delete"
  ON instituciones FOR DELETE TO authenticated
  USING (get_user_role() = 'superadmin');
