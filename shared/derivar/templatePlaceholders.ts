/**
 * Placeholder names used by docxtemplater inside the canonical
 * derivacion_hoja_template_v1.docx. The template author (Bocatas)
 * must keep these names byte-for-byte to avoid runtime errors.
 *
 * Usage in template:
 *   {nombre}, {numUnidadFamiliar}, {programaReferencia},
 *   {profesionalReferencia}, {fechaApertura}
 *
 * Looped table rows:
 *   {#intervenciones}
 *     {fecha} | {tipo} | {descripcion} | {recursoNombre} ... {recursoTelefono} | {observaciones} | {firmaPlaceholder}
 *   {/intervenciones}
 */
export const TEMPLATE_PLACEHOLDERS = {
  nombre: "nombre",
  numUnidadFamiliar: "numUnidadFamiliar",
  programaReferencia: "programaReferencia",
  profesionalReferencia: "profesionalReferencia",
  fechaApertura: "fechaApertura",
  intervenciones: "intervenciones", // loop scope
  rowFecha: "fecha",
  rowTipo: "tipo",
  rowDescripcion: "descripcion",
  rowRecursoNombre: "recursoNombre",
  rowRecursoDireccion: "recursoDireccion",
  rowRecursoTelefono: "recursoTelefono",
  rowObservaciones: "observaciones",
  rowFirmaPlaceholder: "firmaPlaceholder", // intentionally blank for ink signature
} as const;

export const TEMPLATE_FILENAME_DOCX = "derivacion_hoja_template_v3.docx";
export const TEMPLATE_BUCKET = "program-document-templates";
