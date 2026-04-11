-- Migration 19b: add restricciones_alimentarias + foto_perfil_url to persons
-- and update persons_safe view to include them.

ALTER TABLE persons ADD COLUMN IF NOT EXISTS restricciones_alimentarias TEXT;
ALTER TABLE persons ADD COLUMN IF NOT EXISTS foto_perfil_url TEXT;

-- Seed: set dietary restriction on test person for Task 3 check-in testing
UPDATE persons SET restricciones_alimentarias = 'Sin gluten'
  WHERE id = 'b0000000-0000-0000-0000-000000000002';

-- Update persons_safe view to include new columns (non-sensitive)
DROP VIEW IF EXISTS persons_safe;
CREATE VIEW persons_safe AS
SELECT
  id, nombre, apellidos, fecha_nacimiento, genero, pais_origen,
  idioma_principal, idiomas,
  telefono, email, direccion, municipio, barrio_zona,
  tipo_documento, numero_documento,
  -- EXCLUDED: foto_documento_url, situacion_legal
  fecha_llegada_espana,
  tipo_vivienda, estabilidad_habitacional, empadronado,
  nivel_estudios, situacion_laboral, nivel_ingresos,
  persona_referencia, canal_llegada, entidad_derivadora,
  es_retorno, motivo_retorno,
  -- EXCLUDED: recorrido_migratorio, notas_privadas
  necesidades_principales, observaciones,
  fase_itinerario, estado_empleo, empresa_empleo, alertas_activas,
  restricciones_alimentarias, foto_perfil_url,  -- NEW
  metadata, created_at, updated_at, deleted_at
FROM persons;
