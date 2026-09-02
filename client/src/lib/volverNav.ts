/**
 * volverNav — utilidades puras para el enlace «volver» y la navegación
 * anterior/siguiente dentro de un grupo (programa) en la ficha de persona.
 *
 * `volver` viaja por la URL (?volver=/programas/<slug>): sólo se aceptan
 * rutas internas absolutas ("/…"), nunca URLs completas ni protocol-relative
 * ("//evil.com") — un open redirect aquí sería un regalo de phishing.
 */
export function sanitizeVolver(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  if (!raw.startsWith("/") || raw.startsWith("//")) return undefined;
  // El parser de URL del browser normaliza "\" a "/" y descarta tab/CR/LF:
  // "/\evil.com" o "/\t/evil.com" acabarían siendo "//evil.com" en un href.
  if (/[\\\x00-\x1f\x7f]/.test(raw)) return undefined;
  return raw;
}

/** prev/next sobre la lista ordenada de ids del grupo. Fuera de la lista → {}. */
export function computePrevNext(
  ids: readonly string[],
  currentId: string
): { prev?: string; next?: string } {
  const i = ids.indexOf(currentId);
  if (i === -1) return {};
  return { prev: ids[i - 1], next: ids[i + 1] };
}

/** Query-string que preserva el contexto de grupo al saltar entre fichas. */
export function buildGrupoQuery(
  grupoId: string,
  volverHref?: string,
  volverLabel?: string
): string {
  const p = new URLSearchParams();
  if (volverHref) p.set("volver", volverHref);
  if (volverLabel) p.set("volverLabel", volverLabel);
  p.set("grupo", grupoId);
  return `?${p.toString()}`;
}
