// Reglas de FORMATO para los documentos de familia (cliente + servidor).
//
// El informe social es un documento legal: una foto JPG de un informe firmado no
// sirve como tal y además rompe la vista previa, que espera un PDF. La extensión
// no prueba nada — se falsifica renombrando el archivo —, así que la regla se
// aplica en tres sitios y este módulo es la única fuente de verdad de los tres:
//
//   1. `accept` del input de archivo (evita el error, no lo impide).
//   2. comprobación de la cabecera en el cliente (feedback inmediato).
//   3. verificación del objeto YA SUBIDO en el servidor (barrera real).

/** Tipos de documento que solo admiten PDF. */
export const TIPOS_SOLO_PDF: readonly string[] = ["informe_social"];

export function soloAdmitePdf(documentoTipo: string): boolean {
  return TIPOS_SOLO_PDF.includes(documentoTipo);
}

export const ACCEPT_SOLO_PDF = "application/pdf,.pdf";
export const ACCEPT_PDF_O_IMAGEN = "application/pdf, image/*";

/** Valor del atributo `accept` del input para un tipo de documento. */
export function acceptParaTipo(documentoTipo: string): string {
  return soloAdmitePdf(documentoTipo) ? ACCEPT_SOLO_PDF : ACCEPT_PDF_O_IMAGEN;
}

/** Texto de ayuda bajo el input, coherente con el `accept`. */
export function ayudaFormatoParaTipo(documentoTipo: string): string {
  return soloAdmitePdf(documentoTipo)
    ? "Solo PDF (máx 10 MB)"
    : "PDF, JPG, PNG (máx 10 MB)";
}

/** Extensión .pdf. Barrera barata: NO es prueba de contenido. */
export function esRutaPdf(ruta: string): boolean {
  return /\.pdf$/i.test(ruta.trim());
}

/** Firma real de un PDF: todo fichero PDF empieza por «%PDF-» (ISO 32000-1 §7.5.2). */
export function esPdfPorContenido(bytes: Uint8Array): boolean {
  const firma = [0x25, 0x50, 0x44, 0x46, 0x2d]; // % P D F -
  if (bytes.length < firma.length) return false;
  return firma.every((b, i) => bytes[i] === b);
}
