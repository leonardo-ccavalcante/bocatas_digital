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
