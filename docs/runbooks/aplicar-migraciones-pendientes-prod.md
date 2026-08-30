# Runbook — aplicar las migraciones pendientes en producción

**Quién lo ejecuta:** Leo (escritura en producción).
**Por qué existe:** el código de `origin/main` está desplegado en producción con
seis migraciones sin aplicar. La aplicación consulta columnas y valores de enum
que en la base de producción no existen, así que hay funciones rotas AHORA.

Este runbook no se ejecuta solo: cada paso lleva su verificación previa y su
comprobación posterior. Si una verificación previa ya sale satisfecha, la
migración es un no-op y se aplica igual (todas son idempotentes) para que
`schema_migrations` quede al día.

---

## 0 · Cómo se comprobó el desfase

```sql
-- Última migración registrada en producción
select version, name from supabase_migrations.schema_migrations
order by version desc limit 1;
-- → 20260829100001 announcement_images_bucket
```

Todo fichero de `supabase/migrations/` con prefijo mayor está pendiente.

**Evidencia de que esto ya está haciendo daño** (logs de Postgres de producción,
no lectura de código):

| Error real | Veces | Qué rompe |
|---|---|---|
| `column persons.nombre_norm does not exist` | 147 | Búsqueda de personas |
| `column persons_safe.nombre_norm does not exist` | 22 | Búsqueda manual del check-in ("Sin QR") |
| `invalid input value for enum tipo_vivienda: "centro_menores"` | 10 | El alta falla al guardar |
| `invalid input value for enum nivel_estudios: "superior"` | 6 | El alta falla al guardar |

Los dos últimos son el caso más engañoso: el desplegable ofrece la opción porque
el cliente ya tiene el valor nuevo, y el `insert` muere contra el enum viejo. El
voluntario elige algo legítimo y el registro se pierde sin explicación útil.

---

## 1 · Antes de tocar nada

```bash
# Copia de seguridad del proyecto de producción antes de la primera migración.
# (Supabase Dashboard → Database → Backups, o pg_dump con la DB_URL de prod.)
```

Ninguna de las seis borra datos, pero dos añaden valores a un `enum` y eso no se
revierte con un simple `DROP`: hay que tener la copia.

---

## 2 · Las seis, en orden

El orden es el del prefijo. No lo alteres: `nombre_norm` recrea la vista
`persons_safe` y las demás no dependen entre sí, pero el registro de versiones
debe quedar monótono.

### 2.1 `20260830100000_grant_service_role_secdef_rpcs`

**Estado en producción: YA SATISFECHO.** Comprobado:

```sql
select p.proname, has_function_privilege('service_role', p.oid, 'EXECUTE')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public'
  and p.proname in ('find_duplicate_persons','upload_family_document');
-- → ambas true
```

Los `GRANT` ya existen (aplicados a mano en algún momento) y en los logs no hay
ni un `42501`. La cabecera de la migración dice que `persons.findDuplicates`
falla en cada tecla: **eso no es cierto hoy en producción**. Se aplica igual por
el `CREATE OR REPLACE` de `upload_family_document` y para cerrar el registro.

### 2.2 `20260830100001_persons_nombre_norm_search` ← **la urgente**

Añade la columna generada `persons.nombre_norm`, su índice trigram y recrea
`persons_safe`.

Verificación previa (hoy devuelve vacío = la columna no existe):
```sql
select table_name from information_schema.columns
where column_name='nombre_norm' and table_schema='public';
```

Después debe devolver **dos** filas: `persons` y `persons_safe`.

Prueba funcional, la que de verdad importa:
- Buscar una persona por apellido en **Personas**.
- Buscar una persona por nombre en el **check-in sin QR**.

Ambas están rotas ahora mismo y deben responder tras esto.

### 2.3 `20260830110000_tipo_vivienda_centro_menores_piso_entidad`

Añade `centro_menores` y `piso_entidad_social` al enum `tipo_vivienda`.
No reetiqueta `centro_acogida`: son recursos distintos y renombrarlo
reinterpretaría en silencio fichas ya guardadas que acaban en el informe al
financiador.

```sql
select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid
where t.typname='tipo_vivienda' order by enumsortorder;
-- después: deben aparecer centro_menores y piso_entidad_social
```

### 2.4 `20260830110001_nivel_estudios_isced_buckets`

Añade `postsecundaria_no_superior` y `superior`. Misma comprobación sobre
`nivel_estudios`.

> Tras 2.3 y 2.4, el alta deja de fallar con esas opciones. Vale la pena dar de
> alta una persona de prueba eligiendo "Centro de menores" y "Educación
> superior" y luego borrarla.

### 2.5 `20260830110002_programs_empleo_higiene_ocio_juridica_administrativa`

Migración de **datos**, sin cambio de esquema (`database.types.ts` no se mueve).
Inserta `empleo`, `higiene_desayuno` y `ocio`, y renombra `atencion_juridica` a
"Atención Jurídica y Administrativa".

**Dos avisos comprobados contra los datos reales de producción — decide antes de
aplicarla:**

1. **Ya existe `eb_higiene_y_desayuno`** ("E.B Higiene y desayunos", tipo
   `curso`). La migración creará además `higiene_desayuno` ("Servicio de Higiene
   y Desayuno", tipo `continuo`). Quedarán **dos programas para el mismo
   concepto**, y ya hay una edición colgando del primero (`2026_09_hig_desy`).
2. **Ya existe `procesos_administrativos`** como programa aparte. Al renombrar
   `atencion_juridica` a "…y Administrativa", los dos rótulos se solapan.

Ninguno de los dos es un fallo de la migración —son datos creados a mano después
de escribirla— pero aplicarla sin mirar deja el catálogo confuso para el equipo.

```sql
select slug, name, tipo from programs
where slug in ('empleo','higiene_desayuno','ocio','eb_higiene_y_desayuno',
               'atencion_juridica','procesos_administrativos') order by slug;
```

### 2.6 `20260830120000_derivaciones_firmadas_bucket`

**Estado en producción: YA SATISFECHO.** El bucket `derivaciones-firmadas`
existe y es privado. La migración es `ON CONFLICT (id) DO NOTHING`, así que se
aplica sin efecto y cierra el registro.

---

## 3 · Después de las seis

```sql
select version, name from supabase_migrations.schema_migrations
order by version desc limit 6;
```

Y regenerar los tipos con la receta canónica de `AGENTS.md` (`--db-url` +
`--schema public`, nunca `--local` a secas), comprobando que el diff contra
`client/src/lib/database.types.ts` sale **vacío**. Si sale algo, se coló esquema
donde la migración decía que no tocaba.

---

## 4 · Lo que hay que arreglar para que no se repita

Esto es el síntoma; la causa es que **el despliegue de código y la aplicación de
migraciones son dos caminos separados y nadie comprueba que van juntos.** El
código llegó a producción y la base se quedó atrás, y el único aviso fueron
errores de Postgres que nadie estaba mirando.

Mientras no exista un paso de migración en el despliegue, la comprobación manual
mínima antes de dar por bueno cualquier merge que toque `supabase/migrations/`:

```sql
select version from supabase_migrations.schema_migrations order by version desc limit 1;
```

comparado con:

```bash
ls supabase/migrations/ | tail -1
```

Si no coinciden, hay código desplegado contra un esquema que no existe.
