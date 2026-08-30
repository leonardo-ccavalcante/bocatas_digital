/**
 * registrationDraft — borrador del alta, para que una interrupción no obligue a
 * empezar de cero.
 *
 * DÓNDE SE GUARDA Y POR QUÉ
 * -------------------------
 * `sessionStorage`, no `localStorage`. Un borrador de alta contiene nombre,
 * fecha de nacimiento, documento y teléfono de una persona beneficiaria: es
 * PII. `sessionStorage` muere al cerrar la pestaña, así que cubre el caso que
 * el equipo reportó —una llamada, cambiar de app, recargar sin querer— sin
 * dejar los datos de nadie en el móvil del voluntario hasta el día siguiente,
 * ni disponibles para quien coja ese móvil después. Si hiciera falta que un
 * borrador sobreviva de un día para otro, eso ya no es almacenamiento en el
 * navegador: es una tabla en el servidor atada a quien lo está rellenando, y
 * exige su propia decisión de EIPD.
 *
 * QUÉ NO SE GUARDA
 * ----------------
 * - `colectivos`, `colectivo_otros`, `colectivo_consentimiento`: categoría
 *   especial (Art. 9/10). No se escriben ni siquiera en la base sin
 *   consentimiento explícito, así que menos aún en el navegador.
 * - `notas_privadas`: notas internas restringidas.
 * - Las fotos (perfil, documento, consentimiento): son base64 de cientos de KB
 *   y reventarían la cuota, además de ser lo más sensible del formulario.
 *
 * Todo acceso va en try/catch: en navegación privada el propio acceso a
 * sessionStorage puede lanzar, y quedarse sin borrador nunca debe romper un
 * alta.
 */

const CLAVE = "bocatas:alta-borrador:v1";

/** Un borrador más viejo que esto ya no se ofrece: la jornada ha terminado. */
const VIGENCIA_MS = 12 * 60 * 60 * 1000;

/** Campos que NUNCA entran en el borrador. Ver la cabecera. */
export const CAMPOS_EXCLUIDOS = [
  "colectivos",
  "colectivo_otros",
  "colectivo_consentimiento",
  "notas_privadas",
  "foto_perfil_url",
  "foto_documento_url",
] as const;

export interface Borrador {
  guardadoEn: string;
  fase: number;
  valores: Record<string, unknown>;
}

/** Quita los campos excluidos y lo que esté vacío (no merece ocupar cuota). */
export function limpiarValores(valores: Record<string, unknown>): Record<string, unknown> {
  const excluidos = new Set<string>(CAMPOS_EXCLUIDOS);
  const salida: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(valores)) {
    if (excluidos.has(clave)) continue;
    if (valor === undefined || valor === null || valor === "") continue;
    if (Array.isArray(valor) && valor.length === 0) continue;
    salida[clave] = valor;
  }
  return salida;
}

/** ¿Hay algo que merezca la pena ofrecer al volver? */
export function mereceGuardarse(valores: Record<string, unknown>): boolean {
  return Object.keys(limpiarValores(valores)).length > 0;
}

export function guardarBorrador(
  valores: Record<string, unknown>,
  fase: number,
  ahora: number = Date.now()
): void {
  try {
    const limpios = limpiarValores(valores);
    if (Object.keys(limpios).length === 0) {
      sessionStorage.removeItem(CLAVE);
      return;
    }
    const borrador: Borrador = {
      guardadoEn: new Date(ahora).toISOString(),
      fase,
      valores: limpios,
    };
    sessionStorage.setItem(CLAVE, JSON.stringify(borrador));
  } catch {
    // Cuota llena o almacenamiento bloqueado: seguir sin borrador.
  }
}

export function leerBorrador(ahora: number = Date.now()): Borrador | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    if (!crudo) return null;
    const borrador = JSON.parse(crudo) as Borrador;
    if (!borrador?.valores || typeof borrador.guardadoEn !== "string") return null;
    const edad = ahora - new Date(borrador.guardadoEn).getTime();
    if (!Number.isFinite(edad) || edad > VIGENCIA_MS) {
      sessionStorage.removeItem(CLAVE);
      return null;
    }
    return borrador;
  } catch {
    return null;
  }
}

export function borrarBorrador(): void {
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    // Nada que hacer: el borrador caduca solo.
  }
}
