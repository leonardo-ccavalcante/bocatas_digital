/**
 * docxRender.ts — Render Derivar hoja template with data and optional logos
 *
 * Strategy:
 * 1. Load the active template from Supabase Storage (respects app_settings)
 * 2. Inject logos into template ZIP BEFORE rendering
 * 3. Replace placeholder text with image drawing elements
 * 4. Add image files to the ZIP media folder
 * 5. Update relationships and content types
 * 6. Then render the template with docxtemplater
 */

import { createRequire } from "node:module";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

const _require = createRequire(import.meta.url);

import { createAdminClient } from "../../client/src/lib/supabase/server";
import {
  TEMPLATE_BUCKET,
  TEMPLATE_FILENAME_DOCX,
} from "../../shared/derivar/templatePlaceholders";

/**
 * Thrown when the Derivar .docx template cannot be loaded from Storage
 * (not yet uploaded by an admin). Callers map this to a friendly,
 * PII-free client message instead of a raw 500.
 */
export class DerivarTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DerivarTemplateError";
  }
}

export interface DerivarLogoOptions {
  /** PNG/JPEG bytes for the left logo (Bocatas). If omitted, placeholder is left blank. */
  bocatasLogo?: Buffer;
  /**
   * PNG/JPEG bytes for the right logo (e.g. Comunidad de Madrid or a partner).
   * If omitted, placeholder is left blank.
   */
  secondaryLogo?: Buffer;
}

export interface DerivarHojaTemplateData {
  nombre: string;
  numUnidadFamiliar: string;
  programaReferencia: string;
  profesionalReferencia: string;
  fechaApertura: string;
  intervenciones: Array<{
    fecha: string;
    tipo: string;
    descripcion: string;
    recursoNombre: string;
    recursoDireccion: string;
    recursoTelefono: string;
    observaciones: string;
    firmaPlaceholder: string;
  }>;
}

/**
 * Resolves the active template filename from app_settings.
 * Falls back to the default constant if not configured.
 */
async function resolveActiveTemplate(): Promise<string> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "derivar_active_template")
      .maybeSingle();
    if (data?.value && typeof data.value === "string" && data.value.trim()) {
      return data.value.trim();
    }
  } catch {
    // Ignore — fall back to default
  }
  return TEMPLATE_FILENAME_DOCX;
}

/**
 * Loads the secondary logo bytes from Supabase Storage if configured.
 */
export async function loadSecondaryLogo(): Promise<Buffer | undefined> {
  try {
    const db = createAdminClient();
    const { data: setting } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "derivar_secondary_logo_key")
      .maybeSingle();
    const key = setting?.value;
    if (!key || typeof key !== "string" || !key.trim()) return undefined;

    const { data: file, error } = await db.storage
      .from(TEMPLATE_BUCKET)
      .download(key.trim());
    if (error || !file) return undefined;
    return Buffer.from(await file.arrayBuffer());
  } catch {
    return undefined;
  }
}

/**
 * Loads the canonical Derivar template from Supabase Storage and fills it
 * with the supplied data. Returns a Buffer containing the .docx bytes.
 *
 * Optionally injects logos by replacing placeholder text with image elements.
 * The template uses {%bocatasLogo} and {%secondaryLogo} placeholders.
 */
export async function renderDerivarHojaDocx(
  data: DerivarHojaTemplateData,
  logos?: DerivarLogoOptions,
): Promise<Buffer> {
  const db = createAdminClient();
  const templateFilename = await resolveActiveTemplate();

  const { data: file, error } = await db.storage
    .from(TEMPLATE_BUCKET)
    .download(templateFilename);
  if (error || !file) {
    throw new DerivarTemplateError(
      `Could not load Derivar template: ${error?.message ?? "no file"}`,
    );
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const zip = new PizZip(buf);

  // Inject logos BEFORE rendering (so docxtemplater doesn't process them)
  if (logos?.bocatasLogo || logos?.secondaryLogo) {
    injectLogos(zip, logos);
  }

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    // Render missing placeholders as "" instead of throwing
    nullGetter: () => "",
  });
  doc.render(data);

  return doc.toBuffer();
}

/**
 * Injects logos into the DOCX BEFORE rendering by:
 * 1. Finding placeholder text nodes ({%bocatasLogo}, {%secondaryLogo})
 * 2. Replacing them with image drawing elements
 * 3. Adding image files to the ZIP
 * 4. Updating relationships and content types
 *
 * FIX: The XML parser must handle `<w:r ` (with attributes) as well as `<w:r>`
 * (without attributes). We use a regex to find the opening run tag.
 */
function injectLogos(zip: PizZip, logos: DerivarLogoOptions): void {
  const docXmlPath = "word/document.xml";
  const docXml = zip.files[docXmlPath].asText();

  let newDocXml = docXml;
  let imageCounter = 1;
  const imageRels: Array<{ id: number; filename: string; type: string }> = [];

  // Process bocatasLogo
  if (logos.bocatasLogo && logos.bocatasLogo.length > 0 && docXml.includes("{%bocatasLogo}")) {
    const imageXml = createImageElement(imageCounter, 1_200_000, 1_200_000);
    newDocXml = replacePlaceholderWithImage(newDocXml, "{%bocatasLogo}", imageXml);
    imageRels.push({
      id: imageCounter,
      filename: `image${imageCounter}.png`,
      type: "image/png",
    });
    zip.file(`word/media/image${imageCounter}.png`, logos.bocatasLogo);
    imageCounter++;
  }

  // Process secondaryLogo
  if (logos.secondaryLogo && logos.secondaryLogo.length > 0 && docXml.includes("{%secondaryLogo}")) {
    const imageXml = createImageElement(imageCounter, 1_200_000, 1_200_000);
    newDocXml = replacePlaceholderWithImage(newDocXml, "{%secondaryLogo}", imageXml);
    imageRels.push({
      id: imageCounter,
      filename: `image${imageCounter}.png`,
      type: "image/png",
    });
    zip.file(`word/media/image${imageCounter}.png`, logos.secondaryLogo);
    imageCounter++;
  }

  // Update document.xml
  if (imageRels.length > 0) {
    zip.file(docXmlPath, newDocXml);

    // Update relationships
    updateRelationships(zip, imageRels);

    // Update content types
    updateContentTypes(zip, imageRels);
  }
}

/**
 * Replaces a placeholder text inside a DOCX XML run with an image element.
 *
 * The DOCX XML structure for a text run is:
 *   <w:r [optional attributes]><w:rPr>...</w:rPr><w:t>{%placeholder}</w:t></w:r>
 *
 * We find the placeholder, then walk backwards to find the opening <w:r> tag
 * (which may have attributes), and forward to find the closing </w:r> tag.
 *
 * ROOT CAUSE FIX: Previous code used `lastIndexOf("<w:r>")` which only matches
 * runs WITHOUT attributes. Real DOCX files often have `<w:r w:rsidRPr="...">`.
 * We now use a regex to find the last `<w:r` tag before the placeholder.
 */
function replacePlaceholderWithImage(
  xml: string,
  placeholder: string,
  imageXml: string,
): string {
  const placeholderIdx = xml.indexOf(placeholder);
  if (placeholderIdx < 0) return xml;

  // Find the last opening <w:r (with or without attributes) before the placeholder
  const xmlBefore = xml.substring(0, placeholderIdx);
  const wrOpenMatch = xmlBefore.match(/<w:r(?:\s[^>]*)?>(?!.*<w:r(?:\s[^>]*)?>)/s);

  // Find the closing </w:r> after the placeholder
  const wrEndIdx = xml.indexOf("</w:r>", placeholderIdx);

  if (!wrOpenMatch || wrOpenMatch.index === undefined || wrEndIdx < 0) {
    // Fallback: just remove the placeholder text
    return xml.replace(placeholder, "");
  }

  const wrStart = wrOpenMatch.index;
  const wrEnd = wrEndIdx + "</w:r>".length;

  // Replace the entire run with a new run containing only the image
  return xml.substring(0, wrStart) + `<w:r>${imageXml}</w:r>` + xml.substring(wrEnd);
}

/**
 * Creates an inline image drawing element (DrawingML).
 * This is the inner XML that goes inside <w:r>.
 */
function createImageElement(
  imageId: number,
  widthEmu: number,
  heightEmu: number,
): string {
  const rId = `rId${imageId + 100}`; // Avoid conflicts with existing rIds
  // Return just the drawing element (will be wrapped in <w:r> by caller)
  // FIX Bug 1: </wp:inline> must appear BEFORE </w:drawing> (was missing)
  return `<w:rPr><w:sz w:val="2"/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="114300" distR="114300"><wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${imageId}" name="Image ${imageId}"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${imageId}" name="image${imageId}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}

/**
 * Updates word/_rels/document.xml.rels to add image relationships.
 */
function updateRelationships(
  zip: PizZip,
  imageRels: Array<{ id: number; filename: string; type: string }>,
): void {
  const relsPath = "word/_rels/document.xml.rels";
  let relsXml = zip.files[relsPath]?.asText() || "";

  if (!relsXml) {
    // Create rels file if it doesn't exist
    relsXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  }

  // Add image relationships before closing </Relationships>
  for (const img of imageRels) {
    const relXml = `<Relationship Id="rId${img.id + 100}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${img.filename}"/>`;
    relsXml = relsXml.replace("</Relationships>", `${relXml}</Relationships>`);
  }

  zip.file(relsPath, relsXml);
}

/**
 * Updates [Content_Types].xml to add image content types.
 */
function updateContentTypes(
  zip: PizZip,
  imageRels: Array<{ id: number; filename: string; type: string }>,
): void {
  const ctPath = "[Content_Types].xml";
  let ctXml = zip.files[ctPath]?.asText() || "";

  if (!ctXml) {
    ctXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>';
  }

  // FIX Bug 1b: Ensure <Default Extension="png"> is declared at the top level.
  // Without this, Word/LibreOffice cannot resolve PNG images embedded in the DOCX.
  if (!ctXml.includes('Extension="png"')) {
    ctXml = ctXml.replace(
      "</Types>",
      `<Default Extension="png" ContentType="image/png"/></Types>`,
    );
  }

  // Add image override entries (per-file Override for precise content type)
  for (const img of imageRels) {
    if (!ctXml.includes(`PartName="word/media/${img.filename}"`)) {
      const overrideXml = `<Override PartName="word/media/${img.filename}" ContentType="${img.type}"/>`;
      ctXml = ctXml.replace("</Types>", `${overrideXml}</Types>`);
    }
  }

  zip.file(ctPath, ctXml);
}
