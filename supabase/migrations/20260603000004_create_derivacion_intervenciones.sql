-- Phase 3 Task 3b — derivacion_intervenciones (one row per intervention).
-- institucion_snapshot freezes the resource's contact data at insert time so a
-- printed/signed Hoja stays correct even if the institution later changes.

CREATE TABLE IF NOT EXISTS derivacion_intervenciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hoja_id uuid NOT NULL REFERENCES derivacion_hojas(id) ON DELETE RESTRICT,
  fecha date NOT NULL,
  tipo_slug text NOT NULL REFERENCES tipos_intervencion(slug),
  descripcion text NOT NULL,
  institucion_id uuid REFERENCES instituciones(id) ON DELETE SET NULL,
  institucion_snapshot jsonb,
  observaciones text,
  firmado_url text,
  firmado_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX derivacion_intervenciones_hoja_fecha_idx
  ON derivacion_intervenciones(hoja_id, fecha DESC);

ALTER TABLE derivacion_intervenciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intervenciones_admin_read"
  ON derivacion_intervenciones FOR SELECT TO authenticated
  USING (get_user_role() IN ('admin','superadmin'));

CREATE POLICY "intervenciones_admin_write"
  ON derivacion_intervenciones FOR ALL TO authenticated
  USING (get_user_role() IN ('admin','superadmin'))
  WITH CHECK (get_user_role() IN ('admin','superadmin'));
