# Batch 20 — Plan de Implementación

## Diagnóstico de Causas Raíz

### Issue 1 & 2: Preview DOCX/PDF bloqueado por Chrome
**Causa raíz:** El código actual usa `<iframe src="data:application/pdf;base64,...">` para mostrar el PDF.
Chrome bloquea `data:` URIs en iframes por política de seguridad (CSP + navegación de contenido).
Para DOCX no existe ningún visor nativo en browser.

**Solución correcta:**
- PDF: Usar `<object data={objectUrl} type="application/pdf">` con un Blob URL creado desde el base64.
  Los Blob URLs (`blob:`) SÍ funcionan en iframes/object tags en Chrome cuando el documento es del mismo origen.
  Crear el blob URL con `URL.createObjectURL(blob)` y revocarlo al cerrar el modal.
- DOCX: No tiene visor nativo. Mostrar un mensaje informativo "No se puede previsualizar DOCX en el navegador.
  Descarga el archivo para verlo en Word." con un botón de descarga directa.

### Issue 3: Formato DOCX — líneas rotas / contenido ilegible
**Causa raíz:** El DOCX generado está en blanco porque `TEMPLATE_FILENAME_DOCX = "derivacion_hoja_template_v3.docx"`
pero la plantilla en Storage probablemente no existe con ese nombre exacto, o la función `injectLogos`
corrompe el XML del documento al buscar `<w:r>` sin namespace (el XML real usa `<w:r ` con atributos).
El `lastIndexOf("<w:r>", idx)` puede fallar si el `<w:r>` tiene atributos (`<w:r w:rsidR="...">`).

**Solución correcta:**
- Verificar nombre de plantilla en Storage y actualizar `TEMPLATE_FILENAME_DOCX` si es necesario.
- Cambiar `injectLogos` para usar regex que capture `<w:r>` con o sin atributos.
- Usar `docxtemplater` con `imageModule` (docxtemplater-image-module-free) para logos en lugar
  de manipulación manual de XML (que es frágil).

### Issue 4: Formato PDF — 2 páginas, RGPD en página 2
**Causa raíz (confirmada por PDF adjunto):**
- El PDF tiene 2 páginas: página 1 con la tabla, página 2 solo con el RGPD.
- La condición `if (y + ROW_H > PAGE_HEIGHT - MARGIN_BOTTOM - 60)` añade nueva página para la tabla,
  pero el RGPD se añade DESPUÉS de la tabla sin verificar si cabe en la misma página.
- El problema es que `y` después de la tabla ya está cerca del límite, y el RGPD (con su texto largo)
  se desborda a la página 2.
- Además, las columnas de la tabla usan `lineBreak: false` + `ellipsis: true`, lo que trunca el texto.

**Solución correcta:**
- Calcular el espacio necesario para el RGPD (aprox 40pt) antes de dibujarlo.
- Si no cabe, añadir nueva página SOLO para el RGPD (no separarlo arbitrariamente).
- Cambiar `lineBreak: false` a `lineBreak: true` con altura de fila dinámica para que el contenido sea legible.
- Reducir márgenes o ajustar columnas para que todo quepa en 1 página con intervenciones típicas.

### Issue 5: Flujo "Añadir Intervención" incorrecto
**Causa raíz:** En `derivar/index.tsx` línea 75-81, el handler `onAddIntervention` ignora el `hojaId`
(`void hId`) y abre el wizard desde cero (selección de persona/familia).
El servidor ya sabe si existe una hoja activa para esa entidad+programa (via `startIntervention`).

**Solución correcta:**
- Cuando se llama desde `HojaDrawer` (contexto de hoja existente), pasar `hojaId` + datos de la hoja
  al dialog para pre-seleccionar la entidad y saltar el Step 1.
- Mostrar un dialog de confirmación: "¿Añadir al documento actual o crear uno nuevo?"
  - "Mismo documento": usar el `hojaId` existente, ir directamente al formulario de intervención.
  - "Nuevo documento": cerrar la hoja actual y abrir wizard desde Step 1.

### Issue 6: Márgenes UI
**Causa raíz:** El contenedor principal `DerivarTab` usa `className="space-y-3 p-4"` que da padding
insuficiente (16px). Los items de la lista de intervenciones tienen bordes sin padding interior adecuado.

**Solución:** Cambiar a `p-6` en el contenedor y `p-3` en los items de intervención.

### Issue 7: Activar plantilla seleccionada
**Causa raíz:** `TEMPLATE_FILENAME_DOCX` es una constante hardcodeada en `templatePlaceholders.ts`.
No hay mecanismo para cambiarla en runtime.

**Solución correcta:**
- Añadir `derivar_active_template` en `app_settings` con el nombre del archivo activo.
- Añadir procedimiento `setActiveTemplate` en `pdfGenRouter`.
- En `docxRender.ts`, leer `app_settings` para obtener el nombre del template activo.
- En el modal de plantillas, añadir botón "Usar esta plantilla" que llame a `setActiveTemplate`.

### Issue 8: Logo secundario (Comunidad de Madrid)
**Causa raíz:** No hay forma de subir el logo secundario desde la UI. El campo `secondaryLogo` en
`DerivarLogoOptions` existe pero nunca se pasa un valor real.

**Solución correcta:**
- Añadir en el modal de plantillas una sección "Logo secundario" con file input PNG/JPG.
- Subir a `program-document-templates` como `derivar_secondary_logo.png`.
- En `pdfGen.ts`, cargar el logo secundario desde Storage y pasarlo a `renderDerivarHojaPdf`.
- Guardar la clave en `app_settings` como `derivar_secondary_logo_key`.

### Issue 9: Subir hoja firmada
**Causa raíz:** El botón está `disabled`. No hay bucket para PDFs firmados de derivaciones.

**Solución correcta:**
- Crear bucket `derivaciones-firmadas` en Supabase Storage (PDF, max 10MB).
- Añadir procedimiento `uploadSignedHoja` que recibe base64 PDF + `hojaId`, sube a Storage,
  y actualiza `derivacion_hojas.firmado_url`.
- Añadir columna `firmado_url` y `firmado_at` a `derivacion_hojas` (no a intervenciones).
- Habilitar el botón "Subir hoja firmada" con file input PDF.

### Issue 10: Excluir intervención con audit log
**Causa raíz:** No existe el concepto de "excluir" una intervención (soft delete).

**Solución correcta:**
- Añadir columnas `excluded_at TIMESTAMPTZ` y `excluded_by TEXT` a `derivacion_intervenciones`.
- Añadir procedimiento `excludeIntervention(intervencionId, motivo)` con `logAudit`.
- En `getHoja`, filtrar `excluded_at IS NULL` por defecto (con opción de incluir excluidas).
- En `HojaDrawer`, añadir botón "Excluir" en cada fila de intervención con confirmación.
- Las intervenciones excluidas NO aparecen en el DOCX/PDF generado.

---

## Orden de Implementación

1. DB migrations: `excluded_at/excluded_by` en `derivacion_intervenciones` + `firmado_url/firmado_at` en `derivacion_hojas`
2. `app_settings` seed: `derivar_active_template` + `derivar_secondary_logo_key`
3. Crear bucket `derivaciones-firmadas`
4. Fix `docxRender.ts`: leer template activo desde `app_settings`
5. Fix `pdfFromDocxPureNode.ts`: RGPD en misma página, columnas con lineBreak
6. Fix preview modal: Blob URL para PDF, mensaje informativo para DOCX
7. Fix flujo `Añadir Intervención`: dialog de confirmación + skip Step 1
8. Fix márgenes UI
9. Nuevos procedimientos: `setActiveTemplate`, `uploadSecondaryLogo`, `uploadSignedHoja`, `excludeIntervention`
10. UI: modal plantillas con "Usar esta plantilla" + logo secundario + subir hoja firmada + excluir intervención
11. Tests TDD para todos los nuevos procedimientos
12. QA completo + checkpoint

---

## Archivos a modificar

### Server
- `server/routers/derivar/pdfGen.ts` — setActiveTemplate, uploadSecondaryLogo, uploadSignedHoja
- `server/routers/derivar/intervenciones.ts` — excludeIntervention, getHoja filter
- `server/_core/docxRender.ts` — leer template activo desde app_settings
- `server/_core/pdfFromDocxPureNode.ts` — fix RGPD paginación + lineBreak

### Client
- `client/src/features/derivar/HojaDrawer.tsx` — preview fix, subir firmada, excluir, logo secundario, activar plantilla
- `client/src/features/derivar/index.tsx` — fix Añadir Intervención flow + márgenes
- `client/src/features/derivar/hooks/useDerivar.ts` — nuevos hooks

### Shared
- `shared/derivar/templatePlaceholders.ts` — mantener TEMPLATE_FILENAME_DOCX como fallback

### DB (via webdev_execute_sql)
- ALTER TABLE derivacion_intervenciones ADD COLUMN excluded_at TIMESTAMPTZ, excluded_by TEXT
- ALTER TABLE derivacion_hojas ADD COLUMN firmado_url TEXT, firmado_at TIMESTAMPTZ
- INSERT INTO app_settings (key, value) VALUES ('derivar_active_template', 'derivacion_hoja_template_v3.docx')
- INSERT INTO app_settings (key, value) VALUES ('derivar_secondary_logo_key', '')
