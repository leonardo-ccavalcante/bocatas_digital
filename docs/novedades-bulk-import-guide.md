# Guía de importación de anuncios en lote (Novedades)

Esta guía está pensada para el equipo de Bocatas (Sole, Espe, Nacho) que necesita publicar varios anuncios a la vez sin tocar código ni bases de datos.

---

## 1. Cómo descargar la plantilla

Entra en la página de Novedades (/novedades), haz clic en el botón "Importar lote" y, dentro del modal que se abre, selecciona "Descargar plantilla CSV". Se descargará un archivo llamado `novedades-bulk-template.csv` que puedes abrir con Excel, LibreOffice Calc o Google Sheets. Rellena una fila por cada anuncio que quieras publicar y guarda el archivo en formato CSV antes de subirlo.

---

## 2. Columnas de la plantilla

| Columna | Obligatorio | Descripción | Ejemplo |
|---|---|---|---|
| titulo | Sí | Título del anuncio (máx. 200 caracteres) | Comedor cerrado mañana |
| contenido | Sí | Texto completo del anuncio (máx. 5.000 caracteres) | Por obras imprevistas el comedor no abrirá mañana 1 de mayo. |
| tipo | Sí | Categoría del anuncio: `info`, `evento`, `cierre_servicio` o `convocatoria` | cierre_servicio |
| es_urgente | No | Escribe `true` para activar el banner de urgencia en /inicio y el webhook de alerta, o `false` para un anuncio normal | false |
| fecha_inicio | No | Fecha y hora en que el anuncio empieza a aparecer, en formato AAAA-MM-DDTHH:MM | 2026-05-01T08:00 |
| fecha_fin | No | Fecha y hora en que el anuncio deja de aparecer automáticamente, en formato AAAA-MM-DDTHH:MM | 2026-05-02T00:00 |
| fijado | No | Escribe `true` para que el anuncio aparezca siempre en la parte superior del feed, o `false` para orden normal | false |
| audiencias | Sí | A quién va dirigido el anuncio. Ver sección Audiencias más abajo | voluntario:comedor |

---

## 3. Sintaxis de Audiencias (DSL)

Las audiencias permiten dirigir cada anuncio exactamente a quién lo necesita. La regla básica es: escribe el rol, luego dos puntos, luego el programa.

- Cada regla tiene la forma `rol:programa`.
- El asterisco `*` significa "todos" o "cualquiera" en esa dimensión.
- Puedes combinar varios roles o varios programas dentro de una misma regla separándolos con coma.
- Puedes añadir varias reglas separadas por punto y coma `;` — el anuncio llegará a quienes cumplan cualquiera de ellas.

### Ejemplos trabajados

| DSL | Significado |
|---|---|
| `voluntario:comedor` | Solo voluntarios del comedor |
| `admin,superadmin:*` | Todos los admins y superadmins, en cualquier programa |
| `*:familia,formacion` | Cualquier rol que pertenezca a los programas Familias o Formación |
| `*:*` | Todos los usuarios de la plataforma |
| `voluntario:comedor;admin:*` | Voluntarios del comedor O todos los admins |
| `admin:*;voluntario:voluntariado` | Admins de cualquier programa O voluntarios en el programa de voluntariado |

### Roles válidos

`admin`, `superadmin`, `voluntario`, `beneficiario`

### Programas válidos

`comedor`, `familia`, `formacion`, `atencion_juridica`, `voluntariado`, `acompanamiento`

---

## 4. Proceso de importación

1. Descarga la plantilla y rellena una fila por cada anuncio que quieras publicar.
2. Guarda el archivo en formato CSV y súbelo en el modal "Importar lote" desde /novedades.
3. El sistema muestra una vista previa de todos los anuncios. Las filas con error aparecen en rojo con el motivo exacto del problema.
4. Si hay errores: cierra el modal, corrige el CSV en tu ordenador y vuelve a subirlo.
5. Cuando la vista previa esté sin errores, haz clic en "Confirmar importación". Todas las filas válidas se publican a la vez.

---

## 5. Errores comunes y cómo resolverlos

| Error | Causa | Solución |
|---|---|---|
| `tipo: valor no válido` | Usaste "cierre" o "urgente", que son valores heredados y ya no existen | Cambia "cierre" por `cierre_servicio`, o usa `info` con `es_urgente=true` para urgencias |
| `titulo: requerido` | La celda del título está vacía | Rellena el título del anuncio |
| `audiencias: rol desconocido 'X'` | Hay un error tipográfico en el nombre del rol | Revisa la lista de roles válidos en la sección anterior y corrige la ortografía |
| `fecha_fin < fecha_inicio` | La fecha de fin es anterior a la de inicio | Revisa las fechas y corrígelas para que el fin sea posterior al inicio |
| `preview expirado` | Han pasado más de 30 minutos desde que subiste el CSV sin confirmar la importación | Cierra el modal y vuelve a subir el CSV para generar una nueva vista previa |

---

## 6. ¿Qué pasa si me equivoco?

Nada irreversible. Cada anuncio importado se puede editar o eliminar desde /admin/novedades en cualquier momento. Si publicas algo por error, entra en la sección de administración, busca el anuncio y bórralo o corrígelo. No hay acciones permanentes: siempre puedes deshacerlo.
