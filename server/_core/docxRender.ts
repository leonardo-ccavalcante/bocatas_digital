import { createRequire } from "node:module";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const ImageModule = _require("docxtemplater-image-module-free");

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
  /** Width in EMU for bocatasLogo. Default: 1,200,000 EMU ≈ 1.27 cm */
  bocatasLogoWidth?: number;
  /** Height in EMU for bocatasLogo. Default: 1,200,000 EMU ≈ 1.27 cm */
  bocatasLogoHeight?: number;
  /** Width in EMU for secondaryLogo. Default: 1,200,000 EMU ≈ 1.27 cm */
  secondaryLogoWidth?: number;
  /** Height in EMU for secondaryLogo. Default: 1,200,000 EMU ≈ 1.27 cm */
  secondaryLogoHeight?: number;
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

const DEFAULT_LOGO_SIZE = 1_200_000; // EMU ≈ 1.27 cm

/**
 * Loads the canonical Derivar template from Supabase Storage and fills it
 * with the supplied data. Returns a Buffer containing the .docx bytes.
 *
 * Optionally injects logos via docxtemplater-image-module-free.
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

  // Build image lookup map from logo options
  const logoMap: Record<string, Buffer | undefined> = {
    bocatasLogo: logos?.bocatasLogo,
    secondaryLogo: logos?.secondaryLogo,
  };

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const imageModule = new ImageModule({
    centered: false,
    fileType: "docx",
    getImage(_tagValue: string, tagName: string): Buffer | null {
      const img = logoMap[tagName];
      return img ?? null;
    },
    getSize(_img: Buffer, _tagValue: string, tagName: string): [number, number] {
      if (tagName === "bocatasLogo") {
        return [
          logos?.bocatasLogoWidth ?? DEFAULT_LOGO_SIZE,
          logos?.bocatasLogoHeight ?? DEFAULT_LOGO_SIZE,
        ];
      }
      return [
        logos?.secondaryLogoWidth ?? DEFAULT_LOGO_SIZE,
        logos?.secondaryLogoHeight ?? DEFAULT_LOGO_SIZE,
      ];
    },
  });

  const doc = new Docxtemplater(zip, {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    modules: [imageModule],
    paragraphLoop: true,
    linebreaks: true,
    // Render missing placeholders as "" instead of throwing
    nullGetter: () => "",
  });
  doc.render(data);
  return doc.toBuffer();
}
