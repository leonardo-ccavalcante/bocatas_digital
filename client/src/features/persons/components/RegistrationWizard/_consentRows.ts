import {
  getConsentTemplateLanguage,
  type ConsentPurpose,
  type ConsentTemplate,
  type ConsentTemplateIdioma,
} from "../../schemas";

interface BuildConsentRowsArgs {
  purposes: string[];
  consentChoices: Record<string, boolean>;
  consentTemplatesEs: ConsentTemplate[];
  consentTemplatesLang: ConsentTemplate[];
  personLanguage: string | null | undefined;
  consentDocUrl: string | null;
  numeroSerie: string;
  grantedAt?: string;
}

/**
 * Whether the consent step must render the Spanish + verbal-translation banner.
 *
 * True when the person's language is non-Spanish AND either (a) there is no
 * translated template lane for it at all (getConsentTemplateLanguage collapses
 * to "es" for en/ro/zh/wo/other), or (b) the lane exists but does not cover
 * every Spanish-defined purpose. buildConsentRows() falls back to the Spanish
 * template per purpose, so a partially-translated lane would render Spanish for
 * the uncovered purposes with NO banner — silently. Over-warn, never under-warn,
 * is the RGPD-correct bias. (MYTHOS THE-04 / THE-04b)
 */
export function computeVerbalFallback({
  personLanguage,
  consentTemplatesEs,
  consentTemplatesLang,
}: {
  personLanguage: string | null | undefined;
  consentTemplatesEs: ConsentTemplate[];
  consentTemplatesLang: ConsentTemplate[];
}): boolean {
  if (!personLanguage || personLanguage === "es") return false;
  if (getConsentTemplateLanguage(personLanguage) === "es") return true;
  const translatedPurposes = new Set(consentTemplatesLang.map((t) => t.purpose));
  return consentTemplatesEs.some((t) => !translatedPurposes.has(t.purpose));
}

export function buildConsentRows({
  purposes,
  consentChoices,
  consentTemplatesEs,
  consentTemplatesLang,
  personLanguage,
  consentDocUrl,
  numeroSerie,
  grantedAt,
}: BuildConsentRowsArgs) {
  const templateLanguage = getConsentTemplateLanguage(personLanguage);
  const useTranslatedTemplates = templateLanguage !== "es";
  const timestamp = grantedAt ?? new Date().toISOString();
  const serie = numeroSerie.trim() || null;

  return purposes.map((purpose) => {
    const translatedTemplate = useTranslatedTemplates
      ? consentTemplatesLang.find((t) => t.purpose === purpose)
      : undefined;
    const spanishTemplate = consentTemplatesEs.find((t) => t.purpose === purpose);
    const template = translatedTemplate ?? spanishTemplate;
    const idioma: ConsentTemplateIdioma = template?.idioma ?? "es";

    return {
      purpose: purpose as ConsentPurpose,
      idioma,
      granted: consentChoices[purpose] === true,
      granted_at: timestamp,
      consent_text: template?.text_content ?? "",
      consent_version: template?.version ?? "1.0",
      documento_foto_url: consentDocUrl,
      numero_serie: serie,
    };
  });
}

/**
 * Reparto de fines de consentimiento en grupos de la pantalla 4.
 *
 * Grupo A = lo único que bloquea el registro. RGPD Art. 7(4): el consentimiento
 * sólo es libre si negarlo no cuesta el servicio, así que la cesión de imagen y
 * las comunicaciones por WhatsApp NO pueden vivir aquí — una persona puede
 * perfectamente querer comer y no querer salir en una foto.
 *
 * Todo lo demás se sigue recogiendo y se sigue guardando: un fin denegado
 * escribe su fila con granted=false, que es justo el registro que exige el
 * principio de responsabilidad proactiva (Art. 5.2).
 *
 * `purposesConPlantilla` existe por un riesgo de ORDEN DE DESPLIEGUE, no por
 * estética. `archivo_documento_identidad` es un valor de enum NUEVO: si el
 * código llega a producción antes que su migración, pedirlo haría que el
 * `insert` de consentimientos muriera contra el enum viejo y el alta entera
 * fallaría en silencio — que es exactamente lo que ya está pasando allí con
 * `tipo_vivienda` y `nivel_estudios` (ver el runbook de migraciones
 * pendientes). Su plantilla se siembra en la migración inmediatamente
 * posterior a la del enum, así que "hay plantilla" implica "hay valor de
 * enum": preguntamos sólo cuando la base puede recibir la respuesta.
 *
 * El filtro se aplica SÓLO al fin nuevo. Los demás llevan tiempo en el enum, y
 * `compartir_datos_red` hoy no tiene plantilla en producción pero sí valor de
 * enum: filtrarlo también dejaría de recoger un consentimiento que sí se puede
 * guardar (su texto vacío es #167, otro problema).
 */
export function buildConsentGroups({
  hasProgramaFamilias,
  purposesConPlantilla,
}: {
  hasProgramaFamilias: boolean;
  /** Fines con plantilla activa. Si no se pasa, no se filtra nada. */
  purposesConPlantilla?: ReadonlySet<string>;
}): { groupA: string[]; groupB: string[]; groupC: string[] } {
  const hayPlantillaArchivo =
    purposesConPlantilla === undefined ||
    purposesConPlantilla.has("archivo_documento_identidad");

  return {
    groupA: ["tratamiento_datos_bocatas"],
    // Los dos los dispara el mismo programa. Eran dos parámetros idénticos con
    // nombres distintos: separarlos hoy sería inventarse un caso que no existe.
    groupB: hasProgramaFamilias ? ["tratamiento_datos_banco_alimentos"] : [],
    groupC: [
      ...(hasProgramaFamilias ? ["compartir_datos_red"] : []),
      "fotografia",
      // Archivar la imagen del DNI va aquí y NUNCA en el grupo A: Art. 7(4).
      // Guardar una copia del documento no puede ser condición para comer.
      ...(hayPlantillaArchivo ? ["archivo_documento_identidad"] : []),
      "comunicaciones_whatsapp",
    ],
  };
}

/**
 * ¿Se puede almacenar la foto de perfil?
 *
 * El paso de la foto (6) va ANTES del de consentimientos (7), así que la
 * decisión sólo puede tomarse al enviar. Desde que `fotografia` es opcional
 * (RGPD Art. 7(4), ver buildConsentGroups) un registro válido puede llegar aquí
 * con la imagen denegada: sin esta puerta se guardaría igual la cara de la
 * persona, que es justo el tratamiento que acaba de rechazar. Ausencia de
 * decisión = no.
 */
export function puedeGuardarFoto(consentChoices: Record<string, boolean>): boolean {
  return consentChoices["fotografia"] === true;
}

/**
 * ¿Se puede archivar la foto del DOCUMENTO DE IDENTIDAD?
 *
 * Fin propio, no `fotografia`. El texto que la persona firma bajo `fotografia`
 * autoriza imágenes «en las que pueda aparecer durante las actividades de la
 * asociación»: no ampara conservar la imagen de su DNI, que es otro tratamiento,
 * con otra finalidad y otro riesgo. Antes esta foto colgaba de esa puerta
 * prestada — base jurídica equivocada.
 *
 * La casilla de la fase 1 es un opt-out; esto es la puerta. Ausencia de
 * decisión = no.
 */
export function puedeArchivarDocumento(consentChoices: Record<string, boolean>): boolean {
  return consentChoices["archivo_documento_identidad"] === true;
}
