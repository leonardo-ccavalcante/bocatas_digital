-- Epic B: QR Check-in — DB seed & migration artifacts
-- Applied to Supabase project vqvgcsdvvgyubqxumlwn on 2026-04-11
-- Run via Supabase MCP execute_sql (service role)

-- ── 1. Unique constraint on attendances ────────────────────────────────────────
-- Prevents duplicate check-ins for same person + location + program + day
ALTER TABLE attendances
  DROP CONSTRAINT IF EXISTS attendances_unique_checkin;

ALTER TABLE attendances
  ADD CONSTRAINT attendances_unique_checkin
  UNIQUE (person_id, location_id, programa, checked_in_date);

-- ── 2. persons_safe view ───────────────────────────────────────────────────────
-- Public-safe view of persons (no sensitive fields exposed)
CREATE OR REPLACE VIEW persons_safe AS
SELECT
  id,
  nombre,
  apellidos,
  fecha_nacimiento,
  foto_perfil_url,
  restricciones_alimentarias,
  fase_itinerario,
  tipo_documento,
  numero_documento
FROM persons
WHERE deleted_at IS NULL;

-- ── 3. locations seed (3 sedes) ────────────────────────────────────────────────
INSERT INTO locations (id, nombre, direccion, activa)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Comedor Bocatas - Sede Central', 'Calle Principal 1, Madrid', true),
  ('a0000000-0000-0000-0000-000000000002', 'Punto Calle - Opera',            'Plaza de Ópera, Madrid',   true),
  ('a0000000-0000-0000-0000-000000000003', 'La Canada',                      'La Cañada, Madrid',        true)
ON CONFLICT (id) DO NOTHING;

-- ── 4. Demo seed: Maria Garcia Lopez (Sin gluten) ──────────────────────────────
-- Used for demo mode testing and spec acceptance criteria
INSERT INTO persons (
  id, nombre, apellidos, fecha_nacimiento,
  tipo_documento, numero_documento,
  pais_origen, restricciones_alimentarias,
  canal_llegada, fase_itinerario
)
VALUES (
  'b0000000-0000-0000-0000-000000000002',
  'Maria', 'Garcia Lopez', '1985-06-15',
  'DNI', '12345678A',
  'ES', 'Sin gluten',
  'servicios_sociales', 'acogida'
)
ON CONFLICT (id) DO UPDATE SET
  restricciones_alimentarias = EXCLUDED.restricciones_alimentarias;
