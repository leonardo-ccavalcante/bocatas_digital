/**
 * Traducción de los fallos de Zod a algo que se pueda leer en el mostrador.
 *
 * El aviso al registrar era `Revisa los campos: fecha_nacimiento, canal_llegada`
 * — nombres de columna, sin decir qué les pasa ni en qué paso están, así que el
 * voluntario tenía que ir abriendo pasos a ciegas. Aquí cada campo se nombra
 * como aparece en pantalla, se acompaña de su motivo y se agrupa por el paso
 * donde se rellena.
 *
 * Puro a propósito: se prueba sin montar el wizard.
 */

interface CampoDescriptor {
  etiqueta: string;
  /** Fase del wizard (1 Identidad · 2 Contacto · 3 Programa). */
  fase: 1 | 2 | 3;
}

export const NOMBRES_DE_FASE: Record<1 | 2 | 3, string> = {
  1: "Identidad",
  2: "Contacto",
  3: "Programa",
};

/**
 * Etiqueta y paso de cada campo que el esquema puede rechazar. Las claves son
 * las de PersonCreateSchema; las etiquetas, literalmente las de los `<Label>`
 * de cada paso, para que lo que dice el aviso sea lo que se ve en la pantalla.
 */
export const CAMPOS: Record<string, CampoDescriptor> = {
  canal_llegada: { etiqueta: "Canal de llegada", fase: 1 },
  entidad_derivadora: { etiqueta: "Entidad derivadora", fase: 1 },
  persona_referencia: { etiqueta: "Persona de referencia", fase: 1 },
  nombre: { etiqueta: "Nombre", fase: 1 },
  apellidos: { etiqueta: "Apellidos", fase: 1 },
  fecha_nacimiento: { etiqueta: "Fecha de nacimiento", fase: 1 },
  genero: { etiqueta: "Género", fase: 1 },
  pais_origen: { etiqueta: "País de origen", fase: 1 },
  idioma_principal: { etiqueta: "Idioma principal", fase: 1 },
  tipo_documento: { etiqueta: "Tipo de documento", fase: 1 },
  numero_documento: { etiqueta: "Número de documento", fase: 1 },
  pais_documento: { etiqueta: "País del documento", fase: 1 },
  situacion_legal: { etiqueta: "Situación legal", fase: 1 },
  fecha_llegada_espana: { etiqueta: "Llegada a España", fase: 1 },
  telefono: { etiqueta: "Teléfono", fase: 2 },
  email: { etiqueta: "Email", fase: 2 },
  direccion: { etiqueta: "Dirección", fase: 2 },
  codigo_postal: { etiqueta: "Código postal", fase: 2 },
  municipio: { etiqueta: "Municipio", fase: 2 },
  barrio_zona: { etiqueta: "Barrio o zona", fase: 2 },
  tipo_vivienda: { etiqueta: "Tipo de vivienda", fase: 2 },
  nivel_estudios: { etiqueta: "Nivel de estudios", fase: 2 },
  situacion_laboral: { etiqueta: "Situación laboral", fase: 2 },
  situacion_ante_empleo: { etiqueta: "Situación ante el empleo (IRPF)", fase: 2 },
  nivel_ingresos: { etiqueta: "Ingresos aproximados", fase: 2 },
  situacion_vulnerabilidad: { etiqueta: "Situación de vulnerabilidad", fase: 2 },
  situacion_vulnerabilidad_otros: { etiqueta: "Otra situación", fase: 2 },
  colectivos: { etiqueta: "Pertenencia a colectivo", fase: 2 },
  colectivo_otros: { etiqueta: "Colectivo — otros", fase: 2 },
  program_ids: { etiqueta: "Programas", fase: 3 },
  fase_itinerario: { etiqueta: "Fase del itinerario", fase: 3 },
  necesidades_principales: { etiqueta: "Necesidades principales", fase: 3 },
  observaciones: { etiqueta: "Observaciones", fase: 3 },
  restricciones_alimentarias: { etiqueta: "Restricciones alimentarias", fase: 3 },
};

export interface CampoInvalido {
  campo: string;
  etiqueta: string;
  fase: 1 | 2 | 3 | null;
  mensaje: string;
}

/**
 * Forma mínima de un issue de Zod. `path` es `PropertyKey[]` porque Zod 4
 * admite claves de tipo symbol; `String(...)` en describirErrores las absorbe.
 */
interface IssueLike {
  path: readonly PropertyKey[];
  message: string;
}

/**
 * Un fallo por campo (el primero gana: encadenar tres motivos del mismo campo
 * no ayuda a nadie a corregirlo).
 */
export function describirErrores(issues: IssueLike[]): CampoInvalido[] {
  const porCampo = new Map<string, CampoInvalido>();
  for (const issue of issues) {
    const campo = String(issue.path[0] ?? "");
    if (campo === "" || porCampo.has(campo)) continue;
    const descriptor = CAMPOS[campo];
    porCampo.set(campo, {
      campo,
      etiqueta: descriptor?.etiqueta ?? campo,
      fase: descriptor?.fase ?? null,
      mensaje: issue.message,
    });
  }
  return [...porCampo.values()];
}

/**
 * Aviso de una línea, agrupado por paso:
 *   «Identidad — Fecha de nacimiento: La persona debe tener al menos 5 años»
 */
export function mensajeDeErrores(campos: CampoInvalido[]): string {
  if (campos.length === 0) return "Revisa los datos antes de continuar.";
  return campos
    .map((c) => {
      const paso = c.fase ? `${NOMBRES_DE_FASE[c.fase]} — ` : "";
      return `${paso}${c.etiqueta}: ${c.mensaje}`;
    })
    .join(" · ");
}

/** Paso al que conviene volver: el más temprano que tenga algún fallo. */
export function primeraFaseConError(campos: CampoInvalido[]): 1 | 2 | 3 | null {
  const fases = campos
    .map((c) => c.fase)
    .filter((f): f is 1 | 2 | 3 => f !== null)
    .sort((a, b) => a - b);
  return fases[0] ?? null;
}
