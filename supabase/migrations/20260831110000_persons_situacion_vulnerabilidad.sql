-- 20260831110000_persons_situacion_vulnerabilidad.sql
--
-- Feedback del equipo: «En situación actual, en "Otros (especificar)" serán
-- para todos "Situación de vulnerabilidad". ¿Se puede poner esa opción y otra
-- en blanco para escribir?»
--
-- POR QUÉ UN CAMPO NUEVO Y NO UN VALOR MÁS DEL ENUM `colectivo`
-- ------------------------------------------------------------
-- El "Otros (especificar)" al que se refiere el equipo es `colectivo_otros`,
-- que vive dentro del bloque de colectivos: categoría especial RGPD Art. 9/10
-- (origen étnico, orientación sexual, situación penal). Ese bloque SÓLO se
-- persiste si la persona da su consentimiento explícito —el servidor descarta
-- los campos sin él (crud.ts)—, y además `colectivo_otros` va cifrado en
-- reposo.
--
-- "Situación de vulnerabilidad" NO es dato de categoría especial: no revela
-- etnia, ni orientación, ni condena. Meterlo ahí tendría una consecuencia que
-- nadie quiere: para toda persona que no consienta el Art. 9 —que puede negarse
-- sin perder el servicio, Art. 7(4)— el dato se tiraría EN SILENCIO. Y como el
-- equipo dice que será "para todos", se perdería justo el caso mayoritario.
--
-- Así que se añade un campo propio, fuera de la puerta del Art. 9: dos
-- dimensiones ortogonales, dos campos, sin tocar el enum existente.
--
--   situacion_vulnerabilidad        boolean — la casilla que marcará casi todo
--                                   el mundo. Sin default: NULL significa "no
--                                   se preguntó" y false "se preguntó y no",
--                                   distinción que los informes al financiador
--                                   sí necesitan.
--   situacion_vulnerabilidad_otros  text    — el "en blanco para escribir",
--                                   ahora sin la puerta del Art. 9 ni el cifrado.
--
-- Los campos de colectivo se quedan EXACTAMENTE como están: siguen siendo el
-- sitio de los datos que sí son de categoría especial.
--
-- IMPORTADOR LEGADO: `upsert_legacy_person` recibe un jsonb genérico y promueve
-- a columnas tipadas lo que trae el CSV de GUF. Ese CSV no tiene ningún campo
-- de vulnerabilidad, así que no hay nada que promover y la columna queda NULL
-- ("no se preguntó"), que es lo correcto. No se toca la función: añadirle una
-- promoción para un campo que nunca llega sería código muerto.
--
-- Existence-tolerant (AGENTS.md): IF NOT EXISTS cubre undefined_column, y el
-- bloque de COMMENT tolera que la tabla no exista en un entorno divergente.

ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS situacion_vulnerabilidad       boolean,
  ADD COLUMN IF NOT EXISTS situacion_vulnerabilidad_otros text;

DO $$
BEGIN
  COMMENT ON COLUMN public.persons.situacion_vulnerabilidad IS
    'Situación de vulnerabilidad general. NO es categoría especial (Art. 9/10): se recoge y se guarda sin la puerta de consentimiento de los colectivos. NULL = no se preguntó.';
  COMMENT ON COLUMN public.persons.situacion_vulnerabilidad_otros IS
    'Texto libre de "otra situación", fuera del bloque Art. 9. Para etnia / orientación / situación penal usar colectivos y colectivo_otros, que sí están consentidos y cifrados.';
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
