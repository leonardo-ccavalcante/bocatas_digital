/**
 * docxRender.ts — Render Derivar hoja template with data and optional logos
 *
 * Strategy:
 * 1. Inject logos into template ZIP BEFORE rendering
 * 2. Replace placeholder text with image drawing elements
 * 3. Add image files to the ZIP media folder
 * 4. Update relationships and content types
 * 5. Then render the template with docxtemplater
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
  const { data: file, error } = await db.storage
    .from(TEMPLATE_BUCKET)
    .download(TEMPLATE_FILENAME_DOCX);
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
 */
function injectLogos(zip: PizZip, logos: DerivarLogoOptions): void {
  const docXmlPath = "word/document.xml";
  const docXml = zip.files[docXmlPath].asText();

  let newDocXml = docXml;
  let imageCounter = 1;
  const imageRels: Array<{ id: number; filename: string; type: string }> = [];

  // Process bocatasLogo
  if (logos.bocatasLogo && docXml.includes("{%bocatasLogo}")) {
    const imageXml = createImageElement(imageCounter, 1_200_000, 1_200_000);
    newDocXml = newDocXml.replace(
      "<w:t>{%bocatasLogo}</w:t>",
      `<w:r>${imageXml}</w:r>`,
    );
    imageRels.push({
      id: imageCounter,
      filename: `image${imageCounter}.png`,
      type: "image/png",
    });
    zip.file(`word/media/image${imageCounter}.png`, logos.bocatasLogo);
    imageCounter++;
  }

  // Process secondaryLogo
  if (logos.secondaryLogo && docXml.includes("{%secondaryLogo}")) {
    const imageXml = createImageElement(imageCounter, 1_200_000, 1_200_000);
    newDocXml = newDocXml.replace(
      "<w:t>{%secondaryLogo}</w:t>",
      `<w:r>${imageXml}</w:r>`,
    );
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
 * Creates an inline image drawing element (DrawingML).
 * This is the inner XML that goes inside <w:r>.
 */
function createImageElement(
  imageId: number,
  widthEmu: number,
  heightEmu: number,
): string {
  const rId = `rId${imageId + 100}`; // Avoid conflicts with existing rIds
  return `<w:drawing><wp:inline distT="0" distB="0" distL="114300" distR="114300"><wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${imageId}" name="Image ${imageId}"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${imageId}" name="image${imageId}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></w:drawing>`;
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

  // Add image override entries
  for (const img of imageRels) {
    if (!ctXml.includes(`PartName="word/media/${img.filename}"`)) {
      const overrideXml = `<Override PartName="word/media/${img.filename}" ContentType="${img.type}"/>`;
      ctXml = ctXml.replace("</Types>", `${overrideXml}</Types>`);
    }
  }

  zip.file(ctPath, ctXml);
}
