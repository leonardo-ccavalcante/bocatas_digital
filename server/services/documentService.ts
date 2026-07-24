// documentService — the single entry point for all Programa de Familia document
// generation (E1) and derivación rendering (E4).
//
// This file contains the validation layer (DocumentValidationError +
// validateContext) and the rendering layer (renderDocument + auditRender).

import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

import type { FamilyDocumentContext } from "./documentService.types";
import { fetchStorageBuffer } from "../storage";
import { createAdminClient } from "../../client/src/lib/supabase/server";
import { isInformeStale } from "@shared/informeFreshness";

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
    if (isInformeStale(fechaSeguimiento)) {
      throw new DocumentValidationError(
        "STALE_INFORME",
        `El informe social está vencido (último seguimiento: ${fechaSeguimiento}). Registra un seguimiento reciente antes de generar.`,
        { effective_date: [fechaSeguimiento] }
      );
    }
  }
}

// ─── Rendering layer ────────────────────────────────────────────────────────

type DocumentSlug = "informe_social" | "nota_entrega" | "derivacion";

const SLUG_MAP: Record<DocumentSlug, string> = {
  informe_social: "informe-social",
  nota_entrega: "nota-entrega",
  derivacion: "derivacion",
};

/** Build a deterministic output file name. */
function buildFileName(slug: DocumentSlug, familiaNumero: string, date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${SLUG_MAP[slug]}-F${familiaNumero}-${yyyy}-${mm}-${dd}.docx`;
}

/** Cast context to the plain object shape docxtemplater expects. */
function flattenContext(ctx: FamilyDocumentContext): Record<string, unknown> {
  return ctx as unknown as Record<string, unknown>;
}

/**
 * Dotted-path parser for docxtemplater.
 *
 * docxtemplater's DEFAULT parser does NOT resolve dotted tags: `{titular.nombre}`
 * looks up a literal property named "titular.nombre" (not `scope.titular.nombre`)
 * and renders blank. Every template here uses dotted tags (`{titular.nombre}`,
 * `{familia.numero}`, `{round.header.mes_fecha}`), so WITHOUT this parser the
 * beneficiary identity fields silently render EMPTY — a bug the determinism test
 * cannot catch (two equally-blank renders are byte-identical).
 *
 * docxtemplater calls `get` once per scope (innermost first), so returning
 * undefined for a missing intermediate lets it walk up to an outer scope; `"."`
 * is the current-item token used by scalar loops.
 */
function dottedParser(tag: string): { get(scope: unknown): unknown } {
  return {
    get(scope: unknown): unknown {
      if (tag === ".") return scope;
      return tag
        .split(".")
        .reduce<unknown>(
          (v, k) => (v == null ? undefined : (v as Record<string, unknown>)[k]),
          scope
        );
    },
  };
}

/**
 * auditRender — NON-FATAL audit log insert.
 * On failure, logs to console but does NOT rethrow.
 * No PII in the log line — only family UUID + ids.
 */
async function auditRender(
  familyId: string,
  templateSlug: string,
  templateId: string | null,
  actorId: string,
  fileName: string
): Promise<void> {
  try {
    const db = createAdminClient();
    await db.from("document_render_log").insert({
      family_id: familyId,
      template_slug: templateSlug,
      template_id: templateId,
      actor_id: actorId,
      file_name: fileName,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      `[documentService.auditRender] Failed to write render log for family ${familyId}: ${msg}`
    );
  }
}

/**
 * renderDocument — single entry point for all document generation.
 * Used by E1 (informe_social, nota_entrega) and E4 (derivacion).
 */
export async function renderDocument(
  slug: DocumentSlug,
  dataContext: FamilyDocumentContext,
  opts: { actorId: string; familyId: string }
): Promise<{ buffer: Buffer; fileName: string; mime: string }> {
  const db = createAdminClient();

  const { data: template, error } = await db
    .from("document_templates")
    .select("id, slug, mime, storage_path, logos, static_blocks, placeholders")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (error || !template) {
    throw new DocumentValidationError(
      "TEMPLATE_NOT_FOUND",
      `Plantilla no disponible para tipo de documento '${slug}'. Contacta al administrador.`
    );
  }

  const enrichedContext: FamilyDocumentContext = {
    ...dataContext,
    logos: template.logos ?? [],
    static_blocks: { ...(template.static_blocks as Record<string, string>) },
  };

  validateContext(
    {
      id: template.id,
      slug: template.slug,
      placeholders: template.placeholders,
      static_blocks: template.static_blocks as Record<string, string>,
    },
    enrichedContext
  );

  let baseBuffer: Buffer;
  try {
    baseBuffer = await fetchStorageBuffer("document-templates", template.storage_path);
  } catch {
    throw new DocumentValidationError(
      "RENDER_FAILED",
      "Error al cargar la plantilla. Inténtalo de nuevo."
    );
  }

  let out: Buffer;
  try {
    const zip = new PizZip(baseBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => "",
      parser: dottedParser,
    });
    doc.render(flattenContext(enrichedContext));
    out = doc.getZip().generate({ type: "nodebuffer" }) as Buffer;
  } catch {
    // Never forward the raw docxtemplater message to the client (or logs): it
    // can embed rendered VALUES, which here are beneficiary PII (documento,
    // teléfono, nombre). Log by family UUID only and return a fixed message.
    console.error(
      `[documentService.renderDocument] docxtemplater render failed for family ${opts.familyId}`
    );
    throw new DocumentValidationError(
      "RENDER_FAILED",
      "Error al generar el documento. Revisa los datos de la familia."
    );
  }

  const fileName = buildFileName(slug, enrichedContext.familia.numero, new Date());

  await auditRender(opts.familyId, slug, template.id, opts.actorId, fileName);

  return { buffer: out, fileName, mime: template.mime };
}
