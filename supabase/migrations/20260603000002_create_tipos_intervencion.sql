-- Phase 3 Task 2 — tipos_intervencion (DB-seeded; superadmin-editable so the
-- list can grow without engineering involvement). 10 starter categories.

CREATE TABLE IF NOT EXISTS tipos_intervencion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nombre text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tipos_intervencion (slug, nombre, display_order) VALUES
  ('salud',           'Salud',                 10),
  ('apoyo_logistico', 'Apoyo logístico',       20),
  ('vivienda',        'Vivienda',              30),
  ('juridico',        'Jurídico',              40),
  ('empleo',          'Empleo',                50),
  ('alimentacion',    'Alimentación',          60),
  ('infancia',        'Infancia',              70),
  ('salud_mental',    'Salud mental',          80),
  ('formacion',       'Formación',             90),
  ('otro',            'Otro',                 100)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE tipos_intervencion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tipos_read_authenticated"
  ON tipos_intervencion FOR SELECT TO authenticated USING (true);

CREATE POLICY "tipos_superadmin_write"
  ON tipos_intervencion FOR ALL TO authenticated
  USING (get_user_role() = 'superadmin')
  WITH CHECK (get_user_role() = 'superadmin');
