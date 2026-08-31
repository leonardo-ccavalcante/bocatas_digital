-- 20260831100000_documentos_identidad_bucket.sql
--
-- El bucket `documentos-identidad` sólo estaba REFERENCIADO: la política RLS de
-- 20260411082152 lo nombra, pero ninguna migración lo crea. En producción
-- existe (creado a mano en su día), así que esto es un no-op allí; en un
-- `supabase db reset` limpio no existía, y guardar la foto del documento
-- fallaba con "Bucket not found". Es el patrón de gh #134: "un bucket que sólo
-- crea un script de shell es un bug".
--
-- Privado y sólo imágenes: la foto de un DNI es PII de máximo riesgo
-- (`foto_documento_url` está en HIGH_RISK_FIELDS y su lectura ya está
-- restringida a admin/superadmin). Las lecturas se firman en el servidor.
--
-- Los valores replican EXACTAMENTE los del bucket vivo en producción
-- (10 MiB, jpeg/png/webp/gif) para que las dos bases no diverjan.
--
-- No toca el esquema `public`, así que client/src/lib/database.types.ts no se
-- mueve: el diff tras regenerar debe salir vacío.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documentos-identidad',
  'documentos-identidad',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;
