-- Re-exported from supabase_migrations.schema_migrations 2026-05-05
-- version: 20260411081827 — name: 20260410120001_create_enums

-- PERSON ENUMS
CREATE TYPE tipo_documento AS ENUM (
  'DNI', 'NIE', 'Pasaporte', 'Sin_Documentacion'
);

CREATE TYPE genero AS ENUM (
  'masculino', 'femenino', 'no_binario', 'prefiere_no_decir'
);

CREATE TYPE idioma AS ENUM (
  'es', 'ar', 'fr', 'bm', 'en', 'ro', 'zh', 'wo', 'other'
);

CREATE TYPE tipo_vivienda AS ENUM (
  'calle', 'albergue', 'piso_compartido_alquiler', 'piso_propio_alquiler',
  'piso_propio_propiedad', 'ocupacion_sin_titulo', 'pension', 'asentamiento',
  'centro_acogida', 'otros'
);

CREATE TYPE estabilidad_habitacional AS ENUM (
  'sin_hogar', 'inestable', 'temporal', 'estable'
);

CREATE TYPE nivel_estudios AS ENUM (
  'sin_estudios', 'primaria', 'secundaria', 'bachillerato',
  'formacion_profesional', 'universitario', 'postgrado'
);

CREATE TYPE situacion_laboral AS ENUM (
  'desempleado', 'economia_informal', 'empleo_temporal', 'empleo_indefinido',
  'autonomo', 'en_formacion', 'jubilado', 'incapacidad_permanente', 'sin_permiso_trabajo'
);

CREATE TYPE nivel_ingresos AS ENUM (
  'sin_ingresos', 'menos_500', 'entre_500_1000', 'entre_1000_1500', 'mas_1500'
);

CREATE TYPE canal_llegada AS ENUM (
  'boca_a_boca', 'cruz_roja', 'servicios_sociales', 'otra_ong',
  'internet', 'presencial_directo', 'whatsapp', 'telefono',
  'email', 'instagram', 'retorno_bocatas', 'otros'
);

CREATE TYPE fase_itinerario AS ENUM (
  'acogida', 'estabilizacion', 'formacion', 'insercion_laboral', 'autonomia'
);

-- OPERATIONAL ENUMS
CREATE TYPE programa AS ENUM (
  'comedor', 'familia', 'formacion', 'atencion_juridica', 'voluntariado', 'acompanamiento'
);

CREATE TYPE estado_enrollment AS ENUM (
  'activo', 'pausado', 'completado', 'rechazado'
);

CREATE TYPE metodo_checkin AS ENUM (
  'qr_scan', 'manual_busqueda', 'conteo_anonimo'
);

-- CONSENT ENUMS
CREATE TYPE consent_purpose AS ENUM (
  'tratamiento_datos_bocatas', 'tratamiento_datos_banco_alimentos',
  'compartir_datos_red', 'comunicaciones_whatsapp', 'fotografia'
);

CREATE TYPE consent_language AS ENUM (
  'es', 'ar', 'fr', 'bm'
);

-- FAMILY ENUM
CREATE TYPE motivo_baja_familia AS ENUM (
  'no_recogida_consecutiva', 'voluntaria', 'fraude', 'cambio_circunstancias', 'otros'
);
