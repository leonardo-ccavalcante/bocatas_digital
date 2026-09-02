/** Tope de `persons.checkConsentByNames` — pasar de aquí lo rechaza Zod. */
export const MAX_NOMBRES = 100;

/**
 * Una línea = un nombre. Fuera las vacías y los repetidos; se corta en
 * MAX_NOMBRES para que la comprobación no falle entera por pegar de más.
 */
export function parsearNombres(texto: string): string[] {
  const vistos = new Set<string>();
  const nombres: string[] = [];

  for (const linea of texto.split("\n")) {
    const nombre = linea.trim();
    if (!nombre) continue;
    const clave = nombre.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    nombres.push(nombre);
    if (nombres.length === MAX_NOMBRES) break;
  }

  return nombres;
}

/**
 * Nombres únicos que superan MAX_NOMBRES y por tanto NO entran en la
 * comprobación. En una herramienta de consentimiento, una línea que
 * desaparece en silencio es peligrosa: el diálogo lo avisa con este número.
 */
export function contarExcluidos(texto: string): number {
  const vistos = new Set<string>();
  for (const linea of texto.split("\n")) {
    const nombre = linea.trim();
    if (!nombre) continue;
    vistos.add(nombre.toLowerCase());
  }
  return Math.max(0, vistos.size - MAX_NOMBRES);
}
