-- Phase 3 Task 3a — derivacion_hojas (one open Hoja de Registro per
-- (entity, programa)). scope is 'persona' XOR 'familia'; partial unique indexes
-- enforce a single active hoja per entity+programa.

CREATE TABLE IF NOT EXISTS derivacion_hojas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('persona','familia')),
  persona_id uuid REFERENCES persons(id) ON DELETE RESTRICT,
  familia_id uuid REFERENCES families(id) ON DELETE RESTRICT,
  programa_id uuid NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  profesional_id text NOT NULL,
  profesional_nombre text NOT NULL,
  fecha_apertura date NOT NULL DEFAULT current_date,
  estado text NOT NULL CHECK (estado IN ('activa','cerrada')) DEFAULT 'activa',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (scope = 'persona' AND persona_id IS NOT NULL) OR
    (scope = 'familia' AND familia_id IS NOT NULL)
  )
);

-- One open hoja per (persona, programa) / (familia, programa).
CREATE UNIQUE INDEX uq_hoja_persona_programa
  ON derivacion_hojas(persona_id, programa_id)
  WHERE scope='persona' AND estado='activa';

CREATE UNIQUE INDEX uq_hoja_familia_programa
  ON derivacion_hojas(familia_id, programa_id)
  WHERE scope='familia' AND estado='activa';

CREATE INDEX derivacion_hojas_persona_idx ON derivacion_hojas(persona_id) WHERE persona_id IS NOT NULL;
CREATE INDEX derivacion_hojas_familia_idx ON derivacion_hojas(familia_id) WHERE familia_id IS NOT NULL;
CREATE INDEX derivacion_hojas_programa_idx ON derivacion_hojas(programa_id);

ALTER TABLE derivacion_hojas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hojas_admin_read"
  ON derivacion_hojas FOR SELECT TO authenticated
  USING (get_user_role() IN ('admin','superadmin'));

CREATE POLICY "hojas_admin_write"
  ON derivacion_hojas FOR ALL TO authenticated
  USING (get_user_role() IN ('admin','superadmin'))
  WITH CHECK (get_user_role() IN ('admin','superadmin'));
