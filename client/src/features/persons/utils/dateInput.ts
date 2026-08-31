/**
 * dateInput — conversión entre la fecha que se teclea (dd/mm/aaaa) y la que
 * guarda el esquema (ISO aaaa-mm-dd).
 *
 * El wizard usaba `<input type="date">`. En el Android de gama baja que es el
 * dispositivo primario eso no se puede teclear: al tocarlo se abre el diálogo
 * nativo y hay que navegar año → mes → día para cada fecha de nacimiento.
 * Estas funciones son puras a propósito — la lógica de calendario se prueba
 * sin montar React.
 */

/** aaaa-mm-dd → dd/mm/aaaa. Cadena vacía si la entrada no es ISO completa. */
export function isoToDisplay(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Inserta las barras mientras se teclea y descarta todo lo que no sea dígito,
 * de modo que el teclado numérico del móvil basta para rellenar el campo.
 */
export function maskDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * dd/mm/aaaa → aaaa-mm-dd, o null si no es una fecha real.
 *
 * Comprueba el calendario de verdad (31/02 no existe) reconstruyendo la fecha
 * en UTC y verificando que los componentes sobreviven al redondeo: `new Date`
 * acepta el 31 de febrero y lo desplaza al 2 o 3 de marzo en silencio.
 */
export function displayToIso(display: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display.trim());
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const anio = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  // Año de cuatro cifras plausible: descarta los 0007 de un teclazo.
  if (anio < 1900 || anio > 2200) return null;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    d.getUTCFullYear() !== anio ||
    d.getUTCMonth() !== mes - 1 ||
    d.getUTCDate() !== dia
  ) {
    return null;
  }
  return `${m[3]}-${m[2]}-${m[1]}`;
}
