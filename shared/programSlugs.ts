/**
 * programSlugs — los slugs de programa que llevan REGLA DE NEGOCIO.
 *
 * El catálogo de programas es dinámico (tabla `programs`, ADR-0013): un admin
 * crea los que necesite y nadie debe enumerarlos en código. Aquí sólo viven los
 * que el código tiene que reconocer para cambiar de comportamiento.
 *
 * Compartido entre cliente y servidor a propósito: la copia suelta que tenía el
 * wizard de alta se quedó en `"familia"` cuando la migración
 * `20260507000002` renombró el slug a `programa_familias`, y como el valor sólo
 * se compara —nunca se busca— nada falló de forma visible. Simplemente dejaron
 * de pedirse los consentimientos del Banco de Alimentos.
 */

/**
 * Programa Familias. Dispara el paso de composición del hogar en el alta y los
 * consentimientos de Banco de Alimentos y de compartir datos en red.
 */
export const SLUG_PROGRAMA_FAMILIAS = "programa_familias";
