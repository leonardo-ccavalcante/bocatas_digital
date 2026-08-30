-- 20260830110000_tipo_vivienda_centro_menores_piso_entidad.sql
--
-- Feedback del equipo (ALTAS-3) sobre el desplegable "tipo de vivienda":
--   · "Calle / Sin techo"  -> debe leerse "Sin hogar"
--   · "Centro de acogida"  -> debe leerse "Centro de menores"
--   · falta la opción      -> "Piso de entidad social"
--
-- "Sin hogar" es puro cambio de etiqueta sobre el mismo valor `calle`: mismo
-- significado, sin migración.
--
-- "Centro de menores" NO lo es. Un centro de acogida y un centro de menores no
-- son el mismo recurso, así que reetiquetar `centro_acogida` reinterpretaría en
-- silencio a toda persona ya registrada con ese valor — y esa lectura acaba en
-- los informes al financiador. Se añade por tanto un valor NUEVO,
-- `centro_menores`, y `centro_acogida` deja de ofrecerse en el formulario
-- (client/src/features/persons/schemas/labels.ts) pero sigue siendo válido en
-- la base para que las fichas históricas no queden huérfanas.
--
-- ALTER TYPE ... ADD VALUE no puede convivir en la misma transacción con una
-- referencia al valor nuevo, así que aquí sólo se añaden (uno a uno, tolerante),
-- sin usarlos. Mismo patrón que 20260723100002_enrollment_estados_events.sql.

-- 'centro_menores' — recurso residencial de protección de menores
DO $$
BEGIN
  ALTER TYPE public.tipo_vivienda ADD VALUE IF NOT EXISTS 'centro_menores';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- 'piso_entidad_social' — piso cedido/gestionado por una entidad social
DO $$
BEGIN
  ALTER TYPE public.tipo_vivienda ADD VALUE IF NOT EXISTS 'piso_entidad_social';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
