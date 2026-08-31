-- 20260831120001_seed_consent_archivo_documento_identidad.sql
--
-- Plantilla en español de la finalidad añadida en 20260831120000.
--
-- Sólo 'es', que es la línea de base real: en producción únicamente
-- `tratamiento_datos_banco_alimentos` tiene las cuatro lenguas; `fotografia` y
-- `comunicaciones_whatsapp` son es-only. Para ar/fr/bm actúa el mismo mecanismo
-- que ya cubre a `fotografia`: computeVerbalFallback muestra el texto en español
-- con el aviso de traducción verbal, nunca español en silencio (ADR-0006).
--
-- El texto dice lo que `fotografia` NO dice, y en el orden en que a la persona
-- le importa: qué se guarda, para qué, quién puede verlo, cuánto dura, y que
-- negarse no le cuesta nada. El plazo (mientras esté activa + 12 meses desde su
-- última actividad) se aplica de verdad, no es una promesa: lo ejecuta el
-- expurgo automático. No prometer cifrado: el almacén es privado y el acceso va
-- por enlaces firmados de vida corta, que no es lo mismo.

INSERT INTO consent_templates (purpose, idioma, version, text_content, is_active) VALUES
  ('archivo_documento_identidad', 'es',
   '1.0',
   'Autorizo a Asociación Bocatas a conservar una fotografía de mi documento de identidad, con la única finalidad de poder consultarla más adelante para completar o corregir mis datos y para ayudarme en trámites administrativos. La imagen se guarda en un archivo privado, sólo puede verla el personal de superadministración y cada consulta queda registrada. Se conservará mientras yo sea persona atendida y hasta 12 meses después de mi última actividad; después se borra automáticamente. Esta autorización es voluntaria: negarla no afecta a ninguna ayuda ni servicio, y puedo retirarla en cualquier momento contactando con Asociación Bocatas, en cuyo caso la imagen se borra.',
   true)
ON CONFLICT (purpose, idioma) WHERE is_active DO NOTHING;
