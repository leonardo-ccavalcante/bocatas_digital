# Runbook — limpiar los datos de prueba antes de cargar los reales

**Quién lo ejecuta:** Leo (escritura en producción, irreversible).
**Por qué:** los datos de beneficiarios que hay hoy en producción son de prueba
(carga masiva confirmada por Leo). Se vacían para cargar los reales sobre una
base limpia.

**No es una migración, y es a propósito.** Una purga en `supabase/migrations/`
se queda para siempre en la cadena y vuelve a ejecutarse en cualquier entorno
nuevo: si alguien aplica migraciones DESPUÉS de cargar los datos reales, los
borra. Esto es una operación de una vez, y vive aquí.

---

## 1 · Lo que se ha verificado antes de escribir esto

Contra producción, no de memoria:

| Comprobación | Resultado |
|---|---|
| Roles en `persons` | **1018 de 1018 son `beneficiario`** |
| Personal (voluntarios/admin/superadmin) | **9, en `app_users`** — tabla distinta, no la toca nada de esto |
| Tablas de auditoría de firmas | `delivery_signature_audit` y `reparto_signature_audit` a **0 filas** |
| Origen de los datos | **962 de 1018 personas y 598 de 612 familias creadas el mismo día (2026-06-06)** — una sola carga masiva |

De ahí sale la consecuencia que hay que entender antes de ejecutar: **"mantener
sólo voluntarios, admin y superadmin" no necesita ningún filtro sobre
`persons`.** Ese personal no está en `persons`; está en `app_users`, con su
identidad en Supabase Auth. Vaciar `persons` no le afecta.

El script incluye igualmente el filtro `role = 'beneficiario'` y una guarda que
ABORTA si aparece en `persons` alguien que no lo sea. No es decorativo: es la
suposición verificada, escrita de forma que falle ruidosamente si deja de ser
cierta.

---

## 2 · Por qué el orden no es opcional

Diez tablas referencian `persons`, y ocho lo hacen con `RESTRICT` / `NO ACTION`:
un `DELETE FROM persons` a secas **falla**. Además `families.titular_id` es
`RESTRICT`, así que las familias tienen que caer antes que las personas — no es
una preferencia de alcance, es una dependencia.

Cadena de bloqueo, de dentro hacia fuera:

```
derivacion_intervenciones → derivacion_hojas → families / persons
attendances · consents · program_enrollments → persons
familia_miembros · family_member_documents → families
```

Lo que cae solo por `ON DELETE CASCADE` al borrar `families` (no hay que
tocarlo): `deliveries`, `delivery_round_assignments` (**1858 filas**),
`document_render_log`, `family_follow_ups`, `family_webhook_log`. Y
`enrollment_events` (30) cae con `program_enrollments`.

---

## 3 · Antes de ejecutar

**Backup.** Dashboard → Database → Backups → *Create backup*. Es la única red:
esto es `DELETE` de verdad, no `deleted_at`.

**Anota el punto de partida.** Este es el criterio de éxito, no una curiosidad:

```sql
select 'persons' t, count(*) n from persons
union all select 'families', count(*) from families
union all select 'familia_miembros', count(*) from familia_miembros
union all select 'program_enrollments', count(*) from program_enrollments
union all select 'consents', count(*) from consents
union all select 'attendances', count(*) from attendances
union all select 'derivacion_hojas', count(*) from derivacion_hojas
union all select 'app_users', count(*) from app_users
union all select 'programs', count(*) from programs
order by n desc;
```

Hoy: persons 1018 · families 612 · familia_miembros 377 ·
program_enrollments 994 · consents 24 · attendances 4 · derivacion_hojas 3 ·
**app_users 9** · **programs 23**.

Las dos últimas líneas son las que NO deben moverse.

---

## 4 · El script

Todo en una transacción: o se hace entero o no se hace nada.

```sql
begin;

-- Guarda: este script asume que TODO el contenido de `persons` es dato de
-- prueba de beneficiarios. Verificado hoy (1018/1018). Si deja de ser cierto,
-- aborta en vez de borrar a alguien que no tocaba.
do $$
declare n int;
begin
  select count(*) into n from persons where role::text <> 'beneficiario';
  if n > 0 then
    raise exception
      'ABORTADO: % fila(s) de persons no son beneficiario. Revisa antes de limpiar.', n;
  end if;
end $$;

-- 1 · Derivaciones. Las intervenciones bloquean las hojas, y las hojas
--     bloquean TANTO families como persons.
delete from derivacion_intervenciones;
delete from derivacion_hojas;

-- 2 · Hijos directos de persons con RESTRICT.
--     enrollment_events cae por CASCADE con program_enrollments.
delete from attendances;
delete from consents;
delete from program_enrollments;

-- 3 · Documentos de miembros: NO ACTION contra persons. Explícito para no
--     depender de que el cascade de families llegue primero.
delete from family_member_documents;

-- 4 · Miembros y familias. `families` arrastra por CASCADE deliveries,
--     delivery_round_assignments, document_render_log, family_follow_ups
--     y family_webhook_log.
delete from familia_miembros;
delete from families;

-- 5 · Y ahora sí, las personas.
delete from persons where role::text = 'beneficiario';

commit;
```

Si algo falla, la transacción revierte sola y la base queda como estaba. Copia
el error y páralo ahí.

---

## 5 · Comprobar

Vuelve a lanzar la consulta del punto 3. Esperado:

- `persons`, `families`, `familia_miembros`, `program_enrollments`, `consents`,
  `attendances`, `derivacion_hojas` → **0**
- **`app_users` → 9** (sin cambios)
- **`programs` → 23** (sin cambios)

Y en la aplicación: entra con tu usuario. Debe funcionar exactamente igual —
tu sesión no vive en `persons`.

---

## 6 · Dos restos que el script NO toca, a propósito

Ninguno bloquea la carga real; se listan para que la decisión sea tuya y no
mía.

**`family_legacy_import_audit` — 8195 filas.** Es la auditoría de la propia
carga de prueba. Su FK a `families` es `SET NULL`, así que sobrevive huérfana.
Son datos de prueba y pueden llevar PII del CSV. Si quieres la base
verdaderamente limpia:

```sql
delete from family_legacy_import_audit;
delete from legacy_import_sessions;   -- 18 filas
```

**Los ficheros en Storage.** Borrar filas no borra los buckets: fotos de perfil,
fotos de documento, consentimientos firmados y documentos de familia siguen
ahí, ahora sin ninguna ficha que los referencie. Se limpian desde
Dashboard → Storage, bucket por bucket (`fotos-perfil`,
`documentos-identidad`, `documentos-consentimiento`, `family-documents`), no
desde SQL.

---

## 7 · Antes de cargar los datos reales

Aplica primero las migraciones pendientes
(`aplicar-migraciones-pendientes-prod.md`). Dos razones concretas:

- Sin `nombre_norm`, la búsqueda de personas y la del check-in siguen rotas, y
  **la detección de duplicados durante la carga real no se puede comprobar a
  mano** — que es exactamente cómo apareció la ficha duplicada de agosto.
- Sin los valores nuevos de `tipo_vivienda` y `nivel_estudios`, cualquier alta
  que los use falla al guardar.

Limpiar primero y cargar sobre un esquema viejo es repetir el mismo problema
con datos reales en vez de con datos de prueba.
