/**
 * enrollmentContacto.ts — reparte las personas visibles en la tabla en tres
 * grupos por canal: a quién se le puede escribir, a quién le falta el dato y
 * —sólo en el canal de WhatsApp— a quién no ha dado ese consentimiento.
 *
 * Vive fuera del componente porque la pregunta que importa («¿a quién NO le
 * llega el aviso del curso?») es lógica, no pintura, y así se prueba sin
 * montar la tabla.
 */

export type CanalContacto = "email" | "telefono";

export interface PersonaContacto {
  nombre: string | null;
  apellidos: string | null;
  email: string | null;
  telefono: string | null;
  /**
   * ¿Consta el consentimiento `comunicaciones_whatsapp` concedido y no
   * retirado? Lo calcula el servidor en `programs.getEnrollments` leyendo
   * `consents`. Es opcional a propósito: si llegara una fila sin el campo,
   * `undefined` cuenta como NO, que es el lado seguro.
   */
  puede_whatsapp?: boolean;
}

export interface RepartoContacto {
  /** Valores únicos, en el orden de la tabla, listos para pegar. */
  valores: string[];
  /** Nombre completo de quien no tiene ese canal — a esos hay que llamarlos. */
  sinDato: string[];
  /**
   * Nombre completo de quien SÍ tiene teléfono pero no ha dado el
   * consentimiento de WhatsApp. Van por NOMBRE y no por número a propósito:
   * esta lista sirve para saber a quién hay que preguntar, no para pegarla
   * en una difusión. Siempre vacío en el canal `email`.
   */
  sinConsentimiento: string[];
}

/** «Nombre Apellidos» sin espacios colgando; nunca cadena vacía. */
export function nombreCompleto(p: { nombre: string | null; apellidos: string | null }): string {
  return `${p.nombre ?? ""} ${p.apellidos ?? ""}`.trim() || "(sin nombre)";
}

/**
 * El canal `telefono` es el de WhatsApp, y ahí el dato NO basta:
 * `comunicaciones_whatsapp` es uno de los fines que siempre se recogen y en
 * producción hay 60 negativas frente a 23 síes. Sin este corte, el botón
 * entregaría una lista de difusión hecha contra la mayoría de la lista.
 *
 * El correo no se corta porque no hay nada que respetar: el catálogo
 * `consent_purpose` no tiene ningún fin de comunicaciones por email, así que
 * filtrarlo sería inventarse un consentimiento que nadie ha registrado.
 */
export function repartirContacto(
  personas: readonly PersonaContacto[],
  canal: CanalContacto
): RepartoContacto {
  const valores: string[] = [];
  const sinDato: string[] = [];
  const sinConsentimiento: string[] = [];
  const vistos = new Set<string>();

  for (const p of personas) {
    const dato = (p[canal] ?? "").trim();
    if (!dato) {
      sinDato.push(nombreCompleto(p));
      continue;
    }
    // `!== true` y no `=== false`: no saberlo tampoco es un permiso.
    if (canal === "telefono" && p.puede_whatsapp !== true) {
      sinConsentimiento.push(nombreCompleto(p));
      continue;
    }
    // Dos hermanos con el mismo correo se copian una sola vez.
    const clave = dato.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    valores.push(dato);
  }

  return { valores, sinDato, sinConsentimiento };
}

/** Separador '; ' — el que aceptan Gmail y Outlook al pegar en Para/CCO. */
export function formatearParaPegar(valores: readonly string[]): string {
  return valores.join("; ");
}
