/**
 * editableFields — qué campos de la ficha se pueden parchear, y cómo se
 * calcula el parche.
 *
 * Extraído de EditPersonModal para que el formulario pueda partirse por
 * secciones sin arrastrar la lógica del diff, y para que la lista tenga un
 * guard de deriva propio (editableFields.drift.test.ts) contra el esquema
 * CANÓNICO del servidor.
 */
import { PersonCreateSchema, type PersonCreate } from "../../../schemas";

export type EditableValues = Partial<PersonCreate>;

/** Los mismos campos que el servidor acepta parchear (persons/update.ts). */
export const EditableSchema = PersonCreateSchema.omit({
  program_ids: true,
  fase_itinerario: true,
}).partial();

/**
 * Campos de categoría especial (RGPD Art. 9/10).
 *
 * El servidor rechaza el parche si llega alguno de estos SIN
 * `colectivo_consentimiento: true` (update.ts). Basta con que la clave ESTÉ
 * presente, aunque valga null.
 */
export const CAMPOS_ART9 = ["colectivos", "colectivo_otros"] as const;

/**
 * Lo que el servidor acepta y aun así NO se edita aquí. Lista cerrada: el guard
 * de deriva comprueba que sea exactamente esta, para que "limpiarla" no sea un
 * descuido silencioso.
 */
export const CAMPOS_NO_EDITABLES = [
  // No es columna de persons: se gestiona con persons.enroll.
  "program_ids",
  // Tiene procedimiento propio (persons.updateFaseItinerario). Dos escritores
  // para un mismo campo es justo lo que no queremos.
  "fase_itinerario",
  // Transitorio: se añade en guardar() cuando el parche toca Art.9, y el
  // servidor lo quita antes de escribir. Nunca sale del diff.
  "colectivo_consentimiento",
  // persons.getById NO devuelve el path guardado: devuelve una URL FIRMADA
  // (signPathField). Meter estos dos en un campo de texto grabaría esa URL en
  // la columna — la violación CAS-02 que AGENTS.md prohíbe ("Persist the
  // storage PATH, never a URL"). Se cambian volviendo a subir la foto.
  "foto_perfil_url",
  "foto_documento_url",
] as const;

/** Todo lo que el formulario puede tocar. Orden = orden de las secciones. */
export const CAMPOS_EDITABLES = [
  // Canal
  "canal_llegada", "entidad_derivadora", "persona_referencia", "motivo_retorno",
  // Identidad
  "nombre", "apellidos", "fecha_nacimiento", "genero", "pais_origen",
  "idioma_principal", "idiomas",
  // Documento
  "tipo_documento", "numero_documento", "pais_documento", "situacion_legal",
  "fecha_llegada_espana",
  // Contacto
  "telefono", "email", "direccion", "codigo_postal", "municipio", "barrio_zona",
  // Vivienda
  "tipo_vivienda", "estabilidad_habitacional", "empadronado",
  // Situación
  "nivel_estudios", "situacion_laboral", "situacion_ante_empleo", "nivel_ingresos",
  // Social
  "necesidades_principales", "restricciones_alimentarias", "observaciones",
  "recorrido_migratorio", "notas_privadas",
  // Colectivo (Art. 9) — sólo salen del diff con el candado abierto
  "colectivos", "colectivo_otros",
] as const;

export type CampoEditable = (typeof CAMPOS_EDITABLES)[number];

export function valoresIniciales(person: Record<string, unknown>): EditableValues {
  const iniciales: Record<string, unknown> = {};
  for (const campo of CAMPOS_EDITABLES) {
    iniciales[campo] = person[campo] ?? undefined;
  }
  return iniciales as EditableValues;
}

/** `""`, `null`, `undefined` y `[]` son el mismo valor: "vacío". */
const vacio = (v: unknown) =>
  v === "" || v === null || v === undefined || (Array.isArray(v) && v.length === 0);

/**
 * Igualdad que entiende de arrays.
 *
 * `idiomas` y `colectivos` son columnas de array: comparadas con `===` dos
 * arrays de idéntico contenido NUNCA son iguales, así que el diff los emitía
 * siempre. Para `colectivos` eso significa que corregir el teléfono de
 * cualquier persona con un colectivo declarado dispararía la puerta Art. 9 del
 * servidor y el guardado fallaría entero.
 */
const igual = (a: unknown, b: unknown) =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((x, i) => x === b[i])
    : a === b;

/**
 * Diferencia contra los valores de partida.
 *
 * `incluirArt9` es el candado del formulario: mientras esté cerrado, los campos
 * de colectivo NO pueden salir del diff pase lo que pase. Es lo que permite
 * editar cualquier otro campo de una persona con colectivos declarados sin
 * tener que volver a pedirle su consentimiento explícito.
 */
export function calcularCambios(
  iniciales: EditableValues,
  actuales: EditableValues,
  opciones: { incluirArt9?: boolean } = {}
): EditableValues {
  const art9 = new Set<string>(CAMPOS_ART9);
  const cambios: Record<string, unknown> = {};

  for (const campo of CAMPOS_EDITABLES) {
    if (art9.has(campo) && !opciones.incluirArt9) continue;
    const antes = iniciales[campo as CampoEditable];
    const ahora = actuales[campo as CampoEditable];
    if (vacio(antes) && vacio(ahora)) continue;
    if (igual(antes, ahora)) continue;
    cambios[campo] = ahora === undefined ? null : ahora;
  }

  return cambios as EditableValues;
}

/** ¿El parche toca datos de categoría especial? */
export function tocaArt9(cambios: EditableValues): boolean {
  return CAMPOS_ART9.some((c) => cambios[c] !== undefined);
}
