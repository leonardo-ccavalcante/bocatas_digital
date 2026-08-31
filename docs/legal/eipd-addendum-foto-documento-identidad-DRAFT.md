# Adenda EIPD (DRAFT) — Conservación de la fotografía del documento de identidad

> **ESTADO: BORRADOR — NO APLICAR EN PRODUCCIÓN HASTA FIRMA.**
> Debe revisarla y firmarla el/la responsable legal (DPO/abogado RGPD de la
> Asociación Bocatas) **antes** de conservar la imagen del documento de
> identidad de ninguna persona beneficiaria. Sigue el patrón de
> `docs/legal/eipd-addendum-colectivos-DRAFT.md`.

## 1. Objeto y contexto

Hasta ahora el alta capturaba la fotografía del documento de identidad
**únicamente para el OCR** —extraer nombre, apellidos, fecha de nacimiento y
número— y la **descartaba** acto seguido. Ni un solo objeto en el bucket
`documentos-identidad`, ni una sola fila con `persons.foto_documento_url`.

Esta adenda cubre el tratamiento nuevo: **conservar esa imagen**.

**Finalidad** (en palabras del responsable del proyecto): poder **volver a
consultar el documento más adelante** para completar o corregir los datos de la
ficha, y **acompañar a la persona en trámites administrativos** —
empadronamiento, NIE, solicitudes de protección internacional— para los que
suele necesitarse una copia que ella misma muchas veces no conserva.

No es una recogida "por si acaso": es asistencia administrativa a personas que
con frecuencia no tienen dónde guardar sus propios papeles.

## 2. Categorización RGPD

La imagen de un documento de identidad **no es** por sí misma dato de categoría
especial del Art. 9 —una fotografía no procesada por medios técnicos específicos
para identificación unívoca no es dato biométrico—, pero:

- concentra en un solo artefacto nombre, apellidos, fecha de nacimiento,
  nacionalidad, número de documento y rostro;
- en el caso de un permiso de residencia o una tarjeta de solicitante de asilo,
  **revela la situación administrativa** de la persona, que en esta población es
  el dato de mayor riesgo (`persons.situacion_legal` ya está clasificado como
  alto riesgo en `server/_core/rlsRedaction.ts`).

Se trata, por tanto, como **el artefacto de mayor valor del sistema**, por encima
del resto de campos de alto riesgo.

## 3. Base jurídica

**Consentimiento explícito, Art. 6(1)(a)**, mediante una finalidad **propia**:
`archivo_documento_identidad` (enum `consent_purpose`, migración
`20260831120000`; plantilla en español, migración `20260831120001`).

Por qué una finalidad propia y no la que ya existía: el texto que la persona
firma hoy bajo `fotografia` autoriza imágenes «en las que pueda aparecer
**durante las actividades** de la asociación […] documentación interna y memoria
de actividades». Eso **no ampara** conservar la imagen de su DNI, que es otro
tratamiento, con otra finalidad y otro riesgo. `tratamiento_datos_bocatas` es
genérico y tampoco lo menciona. Usar cualquiera de los dos sería una base
jurídica prestada.

**Carácter voluntario (Art. 7(4)).** La finalidad vive en el **grupo opcional**
del formulario de consentimiento: negarla no afecta a ninguna ayuda ni servicio.
Guardar una copia del documento **no puede ser condición para comer**.

**Revocabilidad efectiva.** Retirar el consentimiento **borra la imagen** —no la
marca, la borra— y limpia `persons.foto_documento_url`
(`server/routers/persons/consents.ts`). Un consentimiento que no se puede
retirar de verdad no es consentimiento.

## 4. Medidas técnicas

- **Almacén privado.** Bucket `documentos-identidad`, `public = false`
  (migración `20260831100000`). No se promete cifrado: no lo hay más allá del
  cifrado en reposo del proveedor.
- **Acceso restringido a superadministración.** `persons.getById` **ya no
  devuelve** el campo a ningún rol (ADR-0017). Antes se firmaba para todo rol
  elevado, de modo que cada carga de ficha entregaba en el JSON una URL válida
  diez minutos, la renderizara la interfaz o no.
- **Enlaces de vida corta, acuñados bajo demanda.** `persons.getDocumentUrls`
  (`superadminProcedure`) firma con **TTL de 300 s**, y sólo cuando alguien abre
  el visor.
- **Registro de auditoría en cada consulta**, incluso cuando no hay nada que
  enseñar: identificadores y contadores, nunca la ruta, la URL ni el nombre.
- **Entrada por `personId`, nunca por ruta**, para que no exista forma de pedir
  la firma de un objeto arbitrario del almacén.
- **Visor dentro de la aplicación**, sin abrir la URL firmada en otra pestaña y
  sin botón de descarga.

## 5. Conservación

**Mientras la persona esté activa, y hasta 12 meses después de su última
actividad.** El plazo se ata a la relación porque la finalidad se ata a la
relación: la imagen sirve para acompañar trámites *mientras* se la atiende.

Se aplica solo, no es una promesa: expurgo automático
(`supabase/functions/purge-documentos-identidad`, invocado a diario por
`pg_cron`). **Un plazo que nadie ejecuta no es un plazo, y esta adenda no debe
firmarse antes de que ese expurgo exista y se haya visto correr.**

Borrado adicional en dos momentos que no esperan al plazo:

1. **al retirar el consentimiento** (Art. 7(3));
2. **al retirar la ficha** (`persons.softDelete`). El soft-delete es reversible;
   el borrado de la imagen **no**. La asimetría es deliberada: recuperar una
   ficha no debe resucitar la copia de un documento de identidad.

## 6. Riesgos residuales declarados

- **Ningún cifrado a nivel de aplicación.** La protección es el aislamiento del
  bucket, el TTL corto y la puerta de superadministración.
- **El expurgo depende de `pg_cron` + una Edge Function.** Si se detienen, el
  plazo deja de aplicarse en silencio. Necesita vigilancia.
- **El registro de auditoría va a stderr** (issue #150): es durable, pero no hay
  todavía una consulta cómoda de "quién vio qué".

## 7. Decisión pendiente

Esta adenda **no aplica nada**. Lo que requiere firma es:

1. el texto de la plantilla de consentimiento (migración `20260831120001`);
2. el plazo de conservación de 12 meses desde la última actividad;
3. que la lectura quede restringida a superadministración, con registro.

Relacionado: **#149** (adendas EIPD sin firmar), **ADR-0017** (quién puede leer
la imagen y cómo se acuña el enlace).
