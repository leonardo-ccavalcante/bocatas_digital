/**
 * titleCaseEs — «NOMBRE APELLIDO» → «Nombre Apellido».
 *
 * El OCR devuelve los campos del documento en MAYÚSCULAS
 * (server/routers/ocr.ts no pide caja al modelo). Se normaliza UNA sola vez,
 * al volcar el resultado en el formulario del wizard — no en el render ni en
 * la base de datos; la digitación manual no pasa por aquí. Determinista e
 * idempotente: cualquier caja de entrada produce la misma salida.
 */

/** Partículas que van en minúscula cuando no abren el nombre/apellido. */
const PARTICULAS = new Set([
  "de", "del", "la", "las", "los", "y", "e",
  "da", "dos", "van", "von", "bin", "al",
]);

/** Sube la inicial de cada segmento, también tras apóstrofo o guion. */
function capitalizar(palabra: string): string {
  return palabra
    .split(/([-'])/)
    .map((parte) =>
      parte === "-" || parte === "'"
        ? parte
        : parte.charAt(0).toUpperCase() + parte.slice(1),
    )
    .join("");
}

export function titleCaseEs(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((palabra, i) =>
      i > 0 && PARTICULAS.has(palabra) ? palabra : capitalizar(palabra),
    )
    .join(" ");
}
