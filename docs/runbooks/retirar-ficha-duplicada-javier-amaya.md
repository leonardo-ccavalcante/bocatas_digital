# Runbook — retirar la ficha duplicada de JAVIER ANDRES AMAYA GARCIA

**Quién lo ejecuta:** Leo (escritura en producción).
**Origen:** feedback del equipo, punto 12 — «Nacho ha metido a la misma persona
que yo y ha aceptado duplicarse […] tendríamos que poder eliminar el del código
4cb4a860 […] pero el correcto es el de 2026_09_hig_desy».

---

## 1 · Lo que hay en producción

Dos fichas idénticas, creadas con 25 minutos de diferencia, **ninguna con
check-ins**:

| id | creada | programas | veredicto |
|---|---|---|---|
| `7424993a-9acd-4b6f-8d17-4f41c0c94b76` | 15:53 | `2026_09_hig_desy` | **se queda** |
| `4cb4a860-82b5-449d-b59a-65ce3e19281a` | 16:18 | `atencion_juridica`, `2026_09_coc` | se retira |

Coincide con lo que describió el equipo: la segunda es la de Nacho, con dos
programas, y la buena es la de Hig_desy.

Cada una tiene 3 consentimientos y 0 asistencias, así que retirar la segunda no
se lleva por delante ningún historial de servicio.

**Antes de ejecutar, confirma que los dos programas de la ficha que se retira
(`atencion_juridica` y `2026_09_coc`) no hacían falta.** Si hacían falta, lo
correcto es inscribir a la ficha buena en ellos ANTES de retirar la otra —
retirar no mueve las inscripciones a ninguna parte.

---

## 2 · Por qué pasó (y por qué se va a repetir hasta que se aplique la migración)

No fue descuido. En ese momento la búsqueda de personas estaba **rota en
producción**: `persons.search` consulta `persons.nombre_norm`, una columna que
la migración `20260830100001` nunca aplicó allí. Los logs de Postgres tienen
147 errores `column persons.nombre_norm does not exist`, varios de ellos
**entre las 15:54 y las 15:57**, justo entre el alta de una ficha y la otra.

Es decir: quien fue a comprobar si la persona ya existía no podía buscarla. El
aviso de posible duplicado sí funcionaba (`find_duplicate_persons` tiene sus
permisos correctos, verificado), y se aceptó continuar.

**Retirar esta ficha sin aplicar la migración arregla el caso y deja la causa
intacta.** Ver `aplicar-migraciones-pendientes-prod.md`.

---

## 3 · Ejecutar

`persons.softDelete` (superadmin) está en la interfaz, pero deliberadamente
NO a un clic: ficha → desplegable **«Acciones»** → menú **`⋯`** → **Retirar
ficha…**, y el diálogo no habilita el botón hasta escribir el nombre completo
de la persona (acepta minúsculas y sin tildes; la ñ sí cuenta). Los dos gestos
y el nombre escrito son la protección: en una pantalla de fichas casi idénticas
el error caro no es retirar sin querer, es retirar la ficha equivocada.

Es el camino preferido, porque deja rastro en el log de la aplicación y arrastra
las inscripciones.

Si se prefiere hacerlo en la base antes de desplegar:

```sql
-- Comprobación previa: debe devolver 0.
select count(*) from attendances
where person_id = '4cb4a860-82b5-449d-b59a-65ce3e19281a';

-- Soft-delete de la ficha y de sus inscripciones, con la MISMA marca de tiempo.
begin;

update public.persons
   set deleted_at = now()
 where id = '4cb4a860-82b5-449d-b59a-65ce3e19281a'
   and deleted_at is null;

update public.program_enrollments
   set deleted_at = now()
 where person_id = '4cb4a860-82b5-449d-b59a-65ce3e19281a'
   and deleted_at is null;

commit;
```

Es **soft**-delete: la fila sigue en la base y se puede revertir poniendo
`deleted_at = null`. Los listados de programa filtran por
`persons.deleted_at`, así que la ficha desaparece de `atencion_juridica` y de
`2026_09_coc` sin tocar nada más.

---

## 4 · Comprobar

```sql
select id, nombre, apellidos, deleted_at
  from persons
 where lower(nombre) like '%javier%' and lower(apellidos) like '%amaya%';
-- una fila con deleted_at null (7424993a…) y otra con fecha (4cb4a860…)
```

Y en la aplicación: buscar "Amaya" debe devolver una sola persona, inscrita en
`2026_09_hig_desy`. (Esa búsqueda sólo funcionará una vez aplicada la migración
de `nombre_norm`.)
