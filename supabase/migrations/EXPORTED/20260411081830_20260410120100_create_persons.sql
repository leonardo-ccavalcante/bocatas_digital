-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260411081830 — name: 20260410120100_create_persons

CREATE TABLE persons (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- DATOS PERSONALES (7)
  nombre                   TEXT NOT NULL CHECK (char_length(nombre) >= 2 AND char_length(nombre) <= 100),
  apellidos                TEXT CHECK (char_length(apellidos) <= 200),
  fecha_nacimiento         DATE,
  genero                   genero,
  pais_origen              TEXT CHECK (char_length(pais_origen) = 2),
  idioma_principal         idioma NOT NULL DEFAULT 'es',
  idiomas                  idioma[] DEFAULT '{}',

  -- CONTACTO (5)
  telefono                 TEXT CHECK (telefono ~ '^\+?[0-9\s\-()]{7,20}$'),
  email                    TEXT CHECK (email ~ '^[^@]+@[^@]+\.[^@]+$'),
  direccion                TEXT,
  municipio                TEXT,
  barrio_zona              TEXT,

  -- DOCUMENTACION (5 — 2 HIGH-RISK)
  tipo_documento           tipo_documento,
  numero_documento         TEXT,
  foto_documento_url       TEXT,
  situacion_legal          TEXT,
  fecha_llegada_espana     DATE,

  -- SITUACION HABITACIONAL (3)
  tipo_vivienda            tipo_vivienda,
  estabilidad_habitacional estabilidad_habitacional,
  empadronado              BOOLEAN,

  -- SITUACION SOCIOECONOMICA (3)
  nivel_estudios           nivel_estudios,
  situacion_laboral        situacion_laboral,
  nivel_ingresos           nivel_ingresos,

  -- RED RELACIONAL (5)
  persona_referencia       TEXT,
  canal_llegada            canal_llegada,
  entidad_derivadora       TEXT,
  es_retorno               BOOLEAN DEFAULT false,
  motivo_retorno           TEXT,

  -- INFO SOCIAL (4 — 2 HIGH-RISK)
  recorrido_migratorio     TEXT,
  necesidades_principales  TEXT,
  observaciones            TEXT,
  notas_privadas           Text,

  -- SEGUIMIENTO (4)
  fase_itinerario          fase_itinerario NOT NULL DEFAULT 'acogida',
  estado_empleo            TEXT,
  empresa_empleo           TEXT,
  alertas_activas          JSONB DEFAULT '[]'::jsonb,

  metadata                 JSONB DEFAULT '{}'::jsonb,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at               TIMESTAMPTZ
);

CREATE INDEX idx_persons_nombre_apellidos ON persons (nombre, apellidos) WHERE deleted_at IS NULL;
CREATE INDEX idx_persons_telefono ON persons (telefono) WHERE deleted_at IS NULL AND telefono IS NOT NULL;
CREATE INDEX idx_persons_numero_documento ON persons (numero_documento) WHERE deleted_at IS NULL AND numero_documento IS NOT NULL;
CREATE INDEX idx_persons_pais_origen ON persons (pais_origen) WHERE deleted_at IS NULL;
CREATE INDEX idx_persons_fase_itinerario ON persons (fase_itinerario) WHERE deleted_at IS NULL;
CREATE INDEX idx_persons_deleted_at ON persons (deleted_at);
CREATE INDEX idx_persons_created_at ON persons (created_at);

CREATE INDEX idx_persons_nombre_trgm ON persons USING gin (nombre gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX idx_persons_apellidos_trgm ON persons USING gin (apellidos gin_trgm_ops) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_persons_updated_at
  BEFORE UPDATE ON persons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
