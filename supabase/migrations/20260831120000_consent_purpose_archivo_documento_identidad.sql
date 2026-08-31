-- 20260831120000_consent_purpose_archivo_documento_identidad.sql
--
-- Nueva finalidad de consentimiento: conservar la FOTO DEL DOCUMENTO DE IDENTIDAD.
--
-- Por qué hace falta una finalidad propia y no vale `fotografia`:
-- el texto que la persona firma hoy bajo `fotografia` autoriza imágenes
-- «en las que pueda aparecer durante las actividades de la asociación […]
-- documentación interna y memoria de actividades». Eso no ampara archivar la
-- imagen de su DNI, que es un tratamiento distinto, con otra finalidad y otro
-- riesgo. `tratamiento_datos_bocatas` es genérico y tampoco la menciona.
-- Usar cualquiera de los dos como base jurídica es exactamente lo que una
-- adenda EIPD tendría que rechazar.
--
-- Consecuencia práctica antes de esto: el alta capturaba la foto del documento
-- SÓLO para el OCR y la tiraba. En producción no hay ni un objeto en el bucket
-- `documentos-identidad` ni una sola fila con `foto_documento_url`.
--
-- ALTER TYPE ... ADD VALUE no puede convivir en la misma transacción con una
-- referencia al valor nuevo, así que aquí sólo se añade, sin usarlo; el seed de
-- la plantilla va en el archivo siguiente. Mismo patrón que
-- 20260830110000_tipo_vivienda_centro_menores_piso_entidad.sql.

DO $$
BEGIN
  ALTER TYPE public.consent_purpose ADD VALUE IF NOT EXISTS 'archivo_documento_identidad';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
