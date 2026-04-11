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
  'calle',                        -- sin techo
  'albergue',                     -- centro de acogida / albergue municipal
  'piso_compartido_alquiler',     -- piso compartido en alquiler
  'piso_propio_alquiler',         -- piso propio en alquiler
  'piso_propio_propiedad',        -- piso propio en propiedad
  'ocupacion_sin_titulo',         -- ocupación sin título legal (verificar con EIPD)
  'pension',                      -- pensión / hostal
  'asentamiento',                 -- asentamiento informal (Cañada, etc.)
  'centro_acogida',               -- centro de acogida institucional
  'otros'
);

CREATE TYPE estabilidad_habitacional AS ENUM (
  'sin_hogar', 'inestable', 'temporal', 'estable'
);

CREATE TYPE nivel_estudios AS ENUM (
  'sin_estudios', 'primaria', 'secundaria', 'bachillerato',
  'formacion_profesional', 'universitario', 'postgrado'
);

-- Aligned with Spanish SEPE/INEM categories + informal economy reality
CREATE TYPE situacion_laboral AS ENUM (
  'desempleado',                  -- sin empleo, buscando activamente
  'economia_informal',            -- empleo no declarado / sin contrato (construcción, hostelería, servicio doméstico, cuidados)
  'empleo_temporal',              -- contrato temporal / por obra y servicio
  'empleo_indefinido',            -- contrato indefinido (ex "empleo_estable")
  'autonomo',                     -- autónomo registrado
  'en_formacion',                 -- en formación/capacitación (no trabaja pero no busca)
  'jubilado',                     -- jubilado / pensionista
  'incapacidad_permanente',       -- incapacidad permanente reconocida (term used by INSS)
  'sin_permiso_trabajo'           -- sin permiso de trabajo (situación administrativa irregular)
);

-- PER-PERSON income (not household). Household income is derived from family members.
-- Ranges aligned with Spanish IPREM (Indicador Público de Renta de Efectos Múltiples)
CREATE TYPE nivel_ingresos AS ENUM (
  'sin_ingresos',                 -- 0€/mes
  'menos_500',                    -- <500€/mes (below IPREM)
  'entre_500_1000',               -- 500-1000€/mes (around IPREM)
  'entre_1000_1500',              -- 1000-1500€/mes
  'mas_1500'                      -- >1500€/mes
);

CREATE TYPE canal_llegada AS ENUM (
  'boca_a_boca', 'cruz_roja', 'servicios_sociales', 'otra_ong',
  'internet', 'presencial_directo', 'whatsapp', 'telefono',
  'email', 'instagram',
  'retorno_bocatas',              -- persona que ya fue asistida y regresa
  'otros'
);

CREATE TYPE fase_itinerario AS ENUM (
  'acogida', 'estabilizacion', 'formacion',
  'insercion_laboral', 'autonomia'
);

-- OPERATIONAL ENUMS
CREATE TYPE programa AS ENUM (
  'comedor', 'familia', 'formacion',
  'atencion_juridica', 'voluntariado', 'acompanamiento'
);

CREATE TYPE estado_enrollment AS ENUM (
  'activo', 'pausado', 'completado', 'rechazado'
);

CREATE TYPE metodo_checkin AS ENUM (
  'qr_scan', 'manual_busqueda', 'conteo_anonimo'
);

-- CONSENT ENUMS
CREATE TYPE consent_purpose AS ENUM (
  'tratamiento_datos_bocatas',
  'tratamiento_datos_banco_alimentos',
  'compartir_datos_red',
  'comunicaciones_whatsapp',
  'fotografia'
);

CREATE TYPE consent_language AS ENUM (
  'es', 'ar', 'fr', 'bm'
);

-- FAMILY ENUM
CREATE TYPE motivo_baja_familia AS ENUM (
  'no_recogida_consecutiva', 'voluntaria', 'fraude',
  'cambio_circunstancias', 'otros'
);
