-- 20260830110001_nivel_estudios_isced_buckets.sql
--
-- Feedback del equipo (ALTAS-4): el desplegable de nivel de estudios pasa a las
-- cinco categorías con las que trabajan de verdad:
--   sin estudios · primaria · secundaria ·
--   educación post secundaria no superior (bachillerato / FPGM) ·
--   educación superior (universidad / FPGS)
--
-- Las tres primeras ya existen. Faltan las dos agregadas, que son EXACTAMENTE
-- los buckets que el informe IRPF al financiador ya calcula por su cuenta
-- (ESTUDIOS_ORDER en server/_core/irpfAggregation.ts: postsecundaria_no_superior
-- y superior). Capturarlas directamente cierra además un error de clasificación:
-- el rollup actual manda TODA `formacion_profesional` a postsecundaria, cuando
-- un FP de grado superior es educación superior — el voluntario ya no tiene que
-- elegir entre dos casillas que el informe iba a fundir mal.
--
-- Los siete valores antiguos se conservan en el enum: hay fichas guardadas con
-- ellos y el rollup del informe los sigue mapeando. Sólo desaparecen del
-- formulario (client/src/features/persons/schemas/labels.ts).
--
-- ALTER TYPE ... ADD VALUE no admite referencias al valor nuevo en la misma
-- transacción; aquí sólo se añaden, tolerante y de uno en uno.

-- 'postsecundaria_no_superior' — bachillerato, FP de grado medio
DO $$
BEGIN
  ALTER TYPE public.nivel_estudios ADD VALUE IF NOT EXISTS 'postsecundaria_no_superior';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- 'superior' — universidad, FP de grado superior, postgrado
DO $$
BEGIN
  ALTER TYPE public.nivel_estudios ADD VALUE IF NOT EXISTS 'superior';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
