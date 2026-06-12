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
