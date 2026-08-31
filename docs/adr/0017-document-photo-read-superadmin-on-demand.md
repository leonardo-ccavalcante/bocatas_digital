# ADR-0017 — La foto del documento se acuña bajo demanda, sólo para superadministración y con auditoría

- **Status:** Accepted (2026-08-31, Leo)
- **Deciders:** Leo (Product/Tech Lead)
- **Context source:** Petición de Leo («los superadmin necesitan ver la foto del documento que se subió») + verificación contra producción: los buckets `documentos-identidad` y `documentos-consentimiento` tienen CERO objetos, y ninguna fila de `persons` tiene `foto_documento_url`.
- **Modifica:** el alcance de lectura de `foto_documento_url` fijado en [ADR-0002](0002-app-layer-pii-boundary.md) y descrito en `AGENTS.md` §Compliance.

## Contexto

`foto_documento_url` está en `HIGH_RISK_FIELDS` y la regla escrita era «lectura
restringida a admin/superadmin». En la práctica esa regla se aplicaba con dos
piezas que no bastaban:

1. `redactHighRiskFields` borra el campo para roles NO elevados. Como
   `persons.getById` es `adminProcedure`, esa rama era código muerto: quien
   llega ya es admin o superadmin.
2. `getById` firmaba además el path con `signPathField`, así que **cada carga de
   ficha devolvía en el JSON una URL firmada, válida diez minutos, a la imagen
   del DNI de esa persona** — renderizara la UI lo que renderizara. Un admin con
   las herramientas del navegador, un proxy o una mirada a la caché de React
   Query la tenía igual, y ninguna de esas lecturas dejaba rastro.

La única superficie que la mostraba (`DocumentosTab`) usaba un
`<a target="_blank">` a esa URL: el enlace acababa en la barra de direcciones y
en el historial, y podía compartirse tal cual mientras durase.

Esconder el botón no habría cambiado nada de lo anterior.

## Decisión

1. **`persons.getById` deja de devolver `foto_documento_url`, a NADIE**, ni
   siquiera a superadmin, y se elimina su `signPathField`. Si siguiera
   acuñándose en cada carga de ficha, la auditoría del punto 3 sería mentira.
2. **La lectura vive en una procedure propia**, `persons.getDocumentUrls`, con
   `superadminProcedure`. Su entrada es `personId` y **nunca** un `path`: la
   ruta se lee del servidor y no sale de él. (`families.getDocumentSignedUrl`
   acepta una ruta arbitraria de su bucket para cualquier admin, que es un IDOR;
   no armonizar las dos.)
3. **Cada consulta escribe una línea de auditoría**, incluso cuando no hay nada
   que enseñar —el caso vacío es la señal de enumeración que interesa registrar—
   con ids y contadores, nunca la ruta, la URL ni el nombre. Es la primera
   auditoría de una lectura de `foto_documento_url` del proyecto.
4. **TTL de 300 s**, más corto que el defecto de `storage.ts` (600) y muy lejos
   de la hora que usan los documentos de familia.
5. **El visor es in-app** (diálogo con la imagen, girar y ampliar), sin
   `target="_blank"` y sin botón de descarga.
6. **A un admin se le dice «acceso restringido», nunca «sin documentos».**
   Decirle que no hay documentos cuando sí los hay es fabricar datos.
7. **`foto_documento_url` sale de `PersonUpdateFields`**: sin esto un admin
   podría escribir un campo que ya no puede leer.

## Consecuencias

- Un **admin pierde** un acceso que hoy tiene de hecho. Es deliberado y es la
  petición: la imagen de un documento de identidad es el artefacto de mayor
  valor del sistema.
- `HIGH_RISK_FIELDS` **no** se toca: cambiar su semántica salpica a familias,
  informes y cuatro pruebas de bloqueo a cambio de nada. La restricción vive en
  la procedure que devuelve el campo.
- La prueba `persons.getById-redaction.test.ts` cambia a una aserción
  **estrictamente más fuerte**: antes comprobaba que el campo llegaba a un
  admin; ahora, que no llega nunca a nadie.
- **En producción no hay todavía ninguna imagen que ver.** El alta captura la
  foto del documento sólo para el OCR y la descarta. Archivarla necesita un fin
  de consentimiento propio (`archivo_documento_identidad`) y la adenda EIPD
  de #149: el texto que la persona firma hoy bajo `fotografia` cubre imágenes
  «durante las actividades de la asociación», no conservar la imagen de un DNI.
  Esa parte va aparte y **no** se desbloquea con esta decisión.
- Pendiente, y anotado aquí porque esta es la decisión que hace la imagen
  alcanzable: `softDeleteWithCascade` no borra objetos de Storage, así que una
  ficha retirada deja su foto en el bucket indefinidamente.
