// documentService — the single entry point for all Programa de Familia document
// generation (E1) and derivación rendering (E4).
//
// This file currently contains the validation layer (DocumentValidationError +
// validateContext).  renderDocument() + auditRender() are added in E1 Task 5
// once the document_templates / document_render_log tables exist in the
// generated database types.

import type { FamilyDocumentContext } from "./documentService.types";

export class DocumentValidationError extends Error {
  readonly code: "MISSING_PLACEHOLDER" | "STALE_INFORME" | "TEMPLATE_NOT_FOUND" | "RENDER_FAILED";
  readonly details: Record<string, string[]>;

  constructor(
    code: DocumentValidationError["code"],
    message: string,
    details: Record<string, string[]> = {}
  ) {
    super(message);
    this.name = "DocumentValidationError";
    this.code = code;
    this.details = details;
  }
}

type MinimalTemplate = {
  id: string;
  slug: string;
  placeholders: string[];
  static_blocks: Record<string, string>;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Resolve a dot-path like "titular.nombre" against a nested object. */
function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((curr, key) => {
    if (curr === null || curr === undefined) return undefined;
    return (curr as Record<string, unknown>)[key];
  }, obj);
}

/**
 * validateContext — fail loud BEFORE any rendering begins.
 *
 * Throws DocumentValidationError(MISSING_PLACEHOLDER) if any declared
 * placeholder resolves to null/undefined/empty-string, and
 * DocumentValidationError(STALE_INFORME) for an informe_social whose last
 * follow-up is more than 365 days old.
 */
export function validateContext(
  template: MinimalTemplate,
  context: FamilyDocumentContext
): void {
  const missing: string[] = [];

  for (const placeholder of template.placeholders) {
    const value = resolvePath(context as unknown as Record<string, unknown>, placeholder);
    if (value === null || value === undefined || value === "") {
      missing.push(placeholder);
    }
  }

  if (missing.length > 0) {
    throw new DocumentValidationError(
      "MISSING_PLACEHOLDER",
      "Faltan datos requeridos para generar el documento",
      { missing }
    );
  }

  // Freshness gate: only for informe_social.
  if (template.slug === "informe_social") {
    const fechaSeguimiento = context.informe?.fecha_seguimiento;
    if (!fechaSeguimiento) {
      throw new DocumentValidationError(
        "MISSING_PLACEHOLDER",
        "El informe social requiere un seguimiento registrado",
        { missing: ["informe.fecha_seguimiento"] }
      );
    }
    const ageDays = (Date.now() - new Date(fechaSeguimiento).getTime()) / MS_PER_DAY;
    if (ageDays > 365) {
      throw new DocumentValidationError(
        "STALE_INFORME",
        `El informe social está vencido (último seguimiento: ${fechaSeguimiento}). Registra un seguimiento reciente antes de generar.`,
        { effective_date: [fechaSeguimiento] }
      );
    }
  }
}
