-- 20260830110002_programs_empleo_higiene_ocio_juridica_administrativa.sql
--
-- Feedback del equipo (ALTAS-5) sobre la pantalla 3 del alta:
--   · añadir los programas de Empleo, Servicio de Higiene y Desayuno, y Ocio
--   · unificar Atención Jurídica y Administrativa en uno solo
--
-- Migración de DATOS: ni un solo cambio de esquema, así que
-- client/src/lib/database.types.ts no se mueve (el diff tras regenerar debe
-- salir vacío; si sale algo, se coló schema donde no tocaba).
--
-- La unificación es SÓLO el rótulo. El slug `atencion_juridica` se queda como
-- está a propósito: de él cuelgan la FK de attendances (ON DELETE RESTRICT), las
-- inscripciones vivas de program_enrollments, el valor del enum `programa` que
-- usa announcement_audiences, y slugs escritos a mano en
-- client/src/features/announcements/hooks/useAudienceOptions.ts y
-- client/src/features/persons/components/CheckinHistoryTable.tsx. No existe
-- ninguna fila 'administrativa', así que no hay inscripciones que fusionar.
--
-- Slugs en snake_case: es el patrón real del catálogo (comedor,
-- atencion_juridica, programa_familias) y lo que exigen el regex de
-- ProgramInputSchema (server/routers/programs.ts) y ProgramaSlug del check-in.
--
-- Estos tres NO se añaden al enum `programa` de Postgres: ese enum sólo lo
-- consumen las audiencias de novedades, y ampliarlo choca con la advertencia de
-- shared/announcementTypes.ts (gh #131). Si producto quiere segmentar novedades
-- por ellos, va en su propia migración con esa decisión tomada.

INSERT INTO public.programs (slug, name, icon, is_default, display_order)
VALUES
  ('empleo',           'Empleo',                         '💼', false, 7),
  ('higiene_desayuno', 'Servicio de Higiene y Desayuno', '🚿', false, 8),
  ('ocio',             'Ocio',                           '🎭', false, 9)
ON CONFLICT (slug) DO NOTHING;

-- Flujo continuo, como el resto de programas de atención directa. Tolerante:
-- `tipo` sólo existe a partir de 20260723100001.
DO $$
BEGIN
  UPDATE public.programs
  SET tipo = 'continuo'
  WHERE slug IN ('empleo', 'higiene_desayuno', 'ocio') AND tipo = 'basico';
EXCEPTION
  WHEN undefined_column THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

UPDATE public.programs
SET name = 'Atención Jurídica y Administrativa'
WHERE slug = 'atencion_juridica';
