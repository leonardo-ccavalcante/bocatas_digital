/**
 * enrollmentSeleccion.ts — selección de filas de la tabla de inscritos.
 *
 * Fuera del componente porque el caso feo es de lógica: al cambiar el filtro
 * la página trae otras filas y la selección vieja no puede colarse en la
 * mutación. `seleccionVisible` es el único id que se manda al servidor.
 */

/** Marca o desmarca un id, sin tocar el conjunto recibido. */
export function alternarSeleccion(previa: ReadonlySet<string>, id: string): Set<string> {
  const siguiente = new Set(previa);
  if (!siguiente.delete(id)) siguiente.add(id);
  return siguiente;
}

/** Ids seleccionados que además siguen en la página, en el orden de la tabla. */
export function seleccionVisible(
  seleccion: ReadonlySet<string>,
  idsVisibles: readonly string[]
): string[] {
  return idsVisibles.filter((id) => seleccion.has(id));
}

/** Para la casilla de la cabecera. Una página vacía no está «toda» marcada. */
export function estanTodosSeleccionados(
  seleccion: ReadonlySet<string>,
  idsVisibles: readonly string[]
): boolean {
  return idsVisibles.length > 0 && idsVisibles.every((id) => seleccion.has(id));
}
