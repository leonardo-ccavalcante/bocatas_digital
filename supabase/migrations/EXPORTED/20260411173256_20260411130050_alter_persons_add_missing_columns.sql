-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260411173256 — name: 20260411130050_alter_persons_add_missing_columns

ALTER TABLE persons ADD COLUMN IF NOT EXISTS restricciones_alimentarias TEXT;
ALTER TABLE persons ADD COLUMN IF NOT EXISTS foto_perfil_url TEXT;

UPDATE persons SET restricciones_alimentarias = 'Sin gluten'
  WHERE id = 'b0000000-0000-0000-0000-000000000002';

DROP VIEW IF EXISTS persons_safe;
CREATE VIEW persons_safe AS
SELECT
  id, nombre, apellidos, fecha_nacimiento, genero, pais_origen,
  idioma_principal, idiomas,
  telefono, email, direccion, municipio, barrio_zona,
  tipo_documento, numero_documento,
  fecha_llegada_espana,
  tipo_vivienda, estabilidad_habitacional, empadronado,
  nivel_estudios, situacion_laboral, nivel_ingresos,
  persona_referencia, canal_llegada, entidad_derivadora,
  es_retorno, motivo_retorno,
  necesidades_principales, observaciones,
  fase_itinerario, estado_empleo, empresa_empleo, alertas_activas,
  restricciones_alimentarias, foto_perfil_url,
  metadata, created_at, updated_at, deleted_at
FROM persons;
