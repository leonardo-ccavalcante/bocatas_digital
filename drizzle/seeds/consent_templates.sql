-- Seed: consent_templates (RGPD — Bocatas Digital)
-- Run this after applying all migrations to populate the consent templates.
-- Version: 1.0 | Language: es (Spanish)

-- Clear existing Spanish templates before re-seeding
DELETE FROM consent_templates WHERE idioma = 'es';

-- Group A: Required for all registrations
INSERT INTO consent_templates (purpose, idioma, version, text_content, is_active) VALUES
(
  'tratamiento_datos_bocatas',
  'es',
  '1.0',
  'En cumplimiento del Reglamento General de Proteccion de Datos (RGPD) y la Ley Organica 3/2018 de Proteccion de Datos Personales (LOPDGDD), BOCATAS le informa que sus datos personales seran tratados con la finalidad de gestionar su participacion en los programas de ayuda alimentaria y social de la asociacion. El responsable del tratamiento es BOCATAS (bocatas@bocatas.io). Sus datos no seran cedidos a terceros salvo obligacion legal. Puede ejercer sus derechos de acceso, rectificacion, supresion, limitacion, portabilidad y oposicion dirigiendose a bocatas@bocatas.io. Al firmar este documento, usted consiente expresamente el tratamiento de sus datos.',
  true
),
(
  'comunicaciones_whatsapp',
  'es',
  '1.0',
  'Autorizo a BOCATAS a contactarme a traves de WhatsApp en el numero de telefono facilitado para comunicaciones relacionadas con los programas de ayuda en los que participo, incluyendo avisos de distribucion de alimentos, cambios de horario, documentacion pendiente y otras comunicaciones relevantes para mi atencion.',
  true
),
(
  'fotografia',
  'es',
  '1.0',
  'Autorizo a BOCATAS a tomar fotografias en las que pueda aparecer durante las actividades de la asociacion, y a utilizarlas con fines de documentacion interna y memoria de actividades. Esta autorizacion no incluye la publicacion en redes sociales sin consentimiento adicional explicito.',
  true
);

-- Group B: Required only if enrolled in Banco de Alimentos program
INSERT INTO consent_templates (purpose, idioma, version, text_content, is_active) VALUES
(
  'tratamiento_datos_banco_alimentos',
  'es',
  '1.0',
  'En cumplimiento del RGPD y la LOPDGDD, le informamos que sus datos personales seran comunicados al Banco de Alimentos de Madrid y al sistema GUF (Gestion Unificada de Familias) con la finalidad de gestionar la distribucion de alimentos y coordinar la ayuda alimentaria en la Comunidad de Madrid. El responsable del tratamiento es el Banco de Alimentos de Madrid. Puede ejercer sus derechos contactando con el Banco de Alimentos de Madrid. Al firmar, usted consiente expresamente la comunicacion de sus datos al Banco de Alimentos.',
  true
);

-- Group C: Optional — only shown if enrolled in Programa Familias
INSERT INTO consent_templates (purpose, idioma, version, text_content, is_active) VALUES
(
  'compartir_datos_red',
  'es',
  '1.0',
  'Autorizo a BOCATAS a compartir mis datos con otras organizaciones de la red de apoyo social con el fin de coordinar la atencion integral a mi familia y evitar duplicidades en los servicios recibidos. Esta cesion se realizara unicamente a entidades que garanticen el mismo nivel de proteccion de datos exigido por el RGPD.',
  true
);
